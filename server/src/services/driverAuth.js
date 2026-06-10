import { db } from '../db.js'
import { issueCode, verifyCode } from './channels.js'
import { getDriverBotUsername } from './botConfig.js'

// Менеджер генерит личную ссылку привязки: t.me/<bot>?start=<code> (переиспользуем channels.issueCode).
export async function issueLink(driverId) {
  const { code, expires_at } = await issueCode({ owner_kind: 'driver', owner_id: driverId, type: 'telegram' })
  const username = (await getDriverBotUsername()) || 'driver_bot'
  return { code, url: `https://t.me/${username}?start=${code}`, expires_at }
}

// Бот получил /start <code> от chat_id → привязка (идемпотентна по unique(type,external_id)).
export function bindByCode(code, chatId) {
  return verifyCode({ type: 'telegram', external_id: String(chatId), code })
}

// Резолв водителя по chat_id (для изоляции и повторного входа). null — если не привязан.
export async function resolveDriverByChat(chatId) {
  const ch = await db('channels')
    .where({ type: 'telegram', external_id: String(chatId), owner_kind: 'driver' })
    .whereNotNull('verified_at').first()
  if (!ch) return null
  return db('drivers').where({ id: ch.owner_id }).first()
}

export async function unbind(chatId) {
  await db('channels').where({ type: 'telegram', external_id: String(chatId), owner_kind: 'driver' }).del()
}
