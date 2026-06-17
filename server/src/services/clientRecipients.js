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
// null — если код не найден/уже погашен/не совпал kind.
export async function bindByCode(verifyCode, { chat_id, kind, title, channel = 'telegram' }) {
  const r = await db('client_recipients')
    .where({ verify_code: verifyCode, status: 'pending' })
    .where('verify_expires_at', '>', db.fn.now()) // просроченный код не привязываем
    .first()
  if (!r || r.kind !== kind) return null
  const [row] = await db('client_recipients').where({ id: r.id }).update({
    chat_id, title: title || null, channel, status: 'active',
    verify_code: null, verify_expires_at: null, updated_at: db.fn.now(),
  }).returning('*')
  return row
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

export async function revoke(id) {
  const [row] = await db('client_recipients').where({ id }).update({ status: 'revoked', updated_at: db.fn.now() }).returning('*')
  return row
}
