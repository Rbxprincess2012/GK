import { db } from '../db.js'

const CODE_TTL_MS = 24 * 60 * 60 * 1000 // сутки

function gen6() { return String(Math.floor(100000 + Math.random() * 900000)) }

// Диспетчер генерирует одноразовый код привязки для клиента/водителя.
// Создаёт «ожидающую» строку канала (external_id ещё нет).
export async function issueCode({ owner_kind, owner_id, type = 'telegram' }) {
  const ownerTable = owner_kind === 'client' ? 'clients' : 'drivers'
  const owner = await db(ownerTable).where({ id: owner_id }).first()
  if (!owner) throw Object.assign(new Error('owner_not_found'), { status: 404 })

  const code = gen6()
  const [row] = await db('channels').insert({
    owner_kind, owner_id, type, external_id: null,
    verify_code: code, verify_expires_at: new Date(Date.now() + CODE_TTL_MS),
  }).returning('*')
  return { code, channel_id: row.id, expires_at: row.verify_expires_at }
}

// Бот присылает код от незнакомого chat_id → привязываем external_id к владельцу.
export async function verifyCode({ type = 'telegram', external_id, code }) {
  const pendRow = await db('channels')
    .where({ type, verify_code: code })
    .whereNull('verified_at')
    .andWhere('verify_expires_at', '>', new Date())
    .first()
  if (!pendRow) throw Object.assign(new Error('invalid_or_expired_code'), { status: 400 })

  // если этот chat уже привязан — переиспользуем/перезаписываем владельца
  const existing = await db('channels').where({ type, external_id }).whereNotNull('verified_at').first()
  if (existing && existing.id !== pendRow.id) {
    await db('channels').where({ id: existing.id }).del()
  }

  const [row] = await db('channels').where({ id: pendRow.id })
    .update({ external_id, verified_at: db.fn.now(), verify_code: null }).returning('*')
  return row
}

// n8n определяет отправителя по chat_id.
export async function resolve({ type = 'telegram', external_id }) {
  const row = await db('channels').where({ type, external_id }).whereNotNull('verified_at').first()
  if (!row) return null
  const ownerTable = row.owner_kind === 'client' ? 'clients' : 'drivers'
  const owner = await db(ownerTable).where({ id: row.owner_id }).first()
  return { channel: row, owner_kind: row.owner_kind, owner }
}

export function listForOwner({ owner_kind, owner_id }) {
  return db('channels').where({ owner_kind, owner_id }).orderBy('id')
}

export async function remove(id) {
  await db('channels').where({ id }).del()
}
