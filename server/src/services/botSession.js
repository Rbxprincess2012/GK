import { db } from '../db.js'

// Состояние FSM бота в Postgres (переживает рестарт). Хранилище для grammY-session.
export async function readSession(chatId) {
  const row = await db('bot_sessions').where({ chat_id: chatId }).first()
  return row?.context ?? undefined
}

export async function writeSession(chatId, value) {
  const driver_id = value?.driverId ?? null
  const state = value?.step ?? null
  await db('bot_sessions')
    .insert({ chat_id: chatId, driver_id, state, context: value, updated_at: db.fn.now() })
    .onConflict('chat_id')
    .merge({ driver_id, state, context: value, updated_at: db.fn.now() })
}

export async function deleteSession(chatId) {
  await db('bot_sessions').where({ chat_id: chatId }).del()
}
