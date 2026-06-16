import { db } from '../db.js'
import { issueCode, verifyCode } from './channels.js'
import { getDriverBotUsername, getMaxDriverBotUsername } from './botConfig.js'

// Менеджер генерит личную ссылку привязки. Telegram: t.me/<bot>?start=<code>;
// MAX: max.ru/<bot>?start=<code>. Канал хранится в channels.type ('telegram'|'max').
export async function issueLink(driverId, channel = 'telegram') {
  const { code, expires_at } = await issueCode({ owner_kind: 'driver', owner_id: driverId, type: channel })
  // Без username бота не фабрикуем битую ссылку (раньше падали в 'driver_bot' → «бот не находит»).
  // url=null → UI покажет «бот не настроен»; код можно ввести вручную как фолбэк.
  if (channel === 'max') {
    const username = await getMaxDriverBotUsername()
    return { code, url: username ? `https://max.ru/${username}?start=${code}` : null, expires_at }
  }
  const username = await getDriverBotUsername()
  return { code, url: username ? `https://t.me/${username}?start=${code}` : null, expires_at }
}

// Бот получил deep-link payload/<code> от chat_id → привязка (идемпотентна по unique(type,external_id)).
export function bindByCode(code, chatId, channel = 'telegram') {
  return verifyCode({ type: channel, external_id: String(chatId), code })
}

// Резолв водителя по chat_id в рамках канала (для изоляции и повторного входа). null — не привязан.
export async function resolveDriverByChat(chatId, channel = 'telegram') {
  const ch = await db('channels')
    .where({ type: channel, external_id: String(chatId), owner_kind: 'driver' })
    .whereNotNull('verified_at').first()
  if (!ch) return null
  return db('drivers').where({ id: ch.owner_id }).first()
}

export async function unbind(chatId, channel = 'telegram') {
  await db('channels').where({ type: channel, external_id: String(chatId), owner_kind: 'driver' }).del()
}
