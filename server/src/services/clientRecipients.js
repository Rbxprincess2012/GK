import { randomInt } from 'node:crypto'
import { db } from '../db.js'

// Получатели отчётов клиента (Telegram/MAX): личные чаты и группы. Онбординг — через
// одноразовый код: deep-link payload <code> (личка) или /bind <code> (группа). До привязки
// строка pending (chat_id null); после — active с chat_id и title. Канал — в колонке channel.

const code6 = () => String(randomInt(100000, 1000000))

// Создать «приглашение» — pending-получателя с кодом привязки (живёт 7 дней).
export async function issueInvite(clientId, kind, channel = 'telegram') {
  const [row] = await db('client_recipients').insert({
    client_id: clientId, kind, channel, status: 'pending',
    verify_code: code6(), verify_expires_at: db.raw("now() + interval '7 days'"),
  }).returning('*')
  return row
}

// Привязать чат по коду: pending → active, проставить chat_id/title/channel, погасить код.
// Результат:
//   • row              — успех (active);
//   • null             — код не найден/погашен/просрочен/не совпал kind;
//   • { error: 'chat_taken', title } — этот чат уже привязан к ДРУГОМУ клиенту (активно).
// Чат уникален по (channel, chat_id): одна группа = один получатель. «Мусорные» строки
// (revoked или прежняя привязка ТОГО ЖЕ клиента) освобождаем и переезжаем — иначе уникальный
// индекс роняет привязку 500-й (раньше бот молча падал).
export async function bindByCode(verifyCode, { chat_id, kind, title, channel = 'telegram' }) {
  return db.transaction(async (trx) => {
    const r = await trx('client_recipients')
      .where({ verify_code: verifyCode, status: 'pending' })
      .where('verify_expires_at', '>', trx.fn.now()) // просроченный код не привязываем
      .first()
    if (!r || r.kind !== kind) return null

    const occupant = await trx('client_recipients')
      .where({ channel, chat_id }).whereNot('id', r.id).first()
    if (occupant) {
      // Активная привязка другого клиента — не уводим чужую группу, отказываем понятно.
      if (occupant.status === 'active' && occupant.client_id !== r.client_id) {
        return { error: 'chat_taken', title: occupant.title || null }
      }
      // Иначе освобождаем место (revoked-мусор / прежняя привязка того же клиента).
      await trx('client_recipients').where({ id: occupant.id })
        .update({ chat_id: null, status: 'revoked', updated_at: trx.fn.now() })
    }

    const [row] = await trx('client_recipients').where({ id: r.id }).update({
      chat_id, title: title || null, channel, status: 'active',
      verify_code: null, verify_expires_at: null, updated_at: trx.fn.now(),
    }).returning('*')
    return row
  })
}

export const listForClient = (clientId) => db('client_recipients').where({ client_id: clientId }).orderBy('id')

// Текущая группа-получатель канала (не revoked) — для отрисовки карточки и идемпотентного онбординга.
export function groupRecipient(clientId, channel = 'telegram') {
  return db('client_recipients')
    .where({ client_id: clientId, kind: 'group', channel })
    .whereNot('status', 'revoked')
    .orderBy('id', 'desc')
    .first()
}

// Идемпотентно вернуть приглашение группы: активную/ожидающую строку переиспользуем (с её кодом),
// иначе создаём новый pending-код. Чтобы повторное «Использовать» не плодило дубликаты.
export async function ensureGroupInvite(clientId, channel = 'telegram') {
  return (await groupRecipient(clientId, channel)) || issueInvite(clientId, 'group', channel)
}

// Отозвать привязку. chat_id зануляем, чтобы отозванная строка не держала уникальный индекс
// (channel, chat_id) — иначе ту же группу нельзя привязать заново.
export async function revoke(id) {
  const [row] = await db('client_recipients').where({ id }).update({ status: 'revoked', chat_id: null, updated_at: db.fn.now() }).returning('*')
  return row
}
