import { randomInt } from 'node:crypto'
import { db } from '../db.js'

// Получатели отчётов клиента (Telegram): личные чаты и группы. Онбординг — через
// одноразовый код: личная ссылка /start <code> или /bind <code> в группе. До привязки
// строка pending (chat_id null); после — active с chat_id и title.

const code6 = () => String(randomInt(100000, 1000000))

// Создать «приглашение» — pending-получателя с кодом привязки (живёт 7 дней).
export async function issueInvite(clientId, kind) {
  const [row] = await db('client_recipients').insert({
    client_id: clientId, kind, status: 'pending',
    verify_code: code6(), verify_expires_at: db.raw("now() + interval '7 days'"),
  }).returning('*')
  return row
}

// Привязать чат по коду: pending → active, проставить chat_id/title, погасить код.
// null — если код не найден/уже погашен/не совпал kind.
export async function bindByCode(verifyCode, { chat_id, kind, title }) {
  const r = await db('client_recipients').where({ verify_code: verifyCode, status: 'pending' }).first()
  if (!r || r.kind !== kind) return null
  const [row] = await db('client_recipients').where({ id: r.id }).update({
    chat_id, title: title || null, status: 'active',
    verify_code: null, verify_expires_at: null, updated_at: db.fn.now(),
  }).returning('*')
  return row
}

export const listForClient = (clientId) => db('client_recipients').where({ client_id: clientId }).orderBy('id')

export async function revoke(id) {
  const [row] = await db('client_recipients').where({ id }).update({ status: 'revoked', updated_at: db.fn.now() }).returning('*')
  return row
}
