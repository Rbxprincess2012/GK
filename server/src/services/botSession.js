import { db } from '../db.js'

// Состояние FSM бота в Postgres (переживает рестарт). Хранилище для grammY/maxgram-session.
// Ключ — (channel, chat_id): один и тот же числовой chat_id в Telegram и MAX — разные сессии.
export async function readSession(channel, chatId) {
  const row = await db('bot_sessions').where({ channel, chat_id: chatId }).first()
  return row?.context ?? undefined
}

export async function writeSession(channel, chatId, value) {
  const driver_id = value?.driverId ?? null
  const state = value?.step ?? null
  await db('bot_sessions')
    .insert({ channel, chat_id: chatId, driver_id, state, context: value, updated_at: db.fn.now() })
    .onConflict(['channel', 'chat_id'])
    .merge({ driver_id, state, context: value, updated_at: db.fn.now() })
}

export async function deleteSession(channel, chatId) {
  await db('bot_sessions').where({ channel, chat_id: chatId }).del()
}
