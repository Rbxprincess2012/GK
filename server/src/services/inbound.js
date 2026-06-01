import { db } from '../db.js'

// Сохраняет входящее сообщение (сырьё + транскрипт). Дедуп по external_message_id:
// повтор того же Telegram-апдейта не плодит строку.
export async function record(data) {
  if (data.external_message_id) {
    const existing = await db('inbound_messages').where({ external_message_id: data.external_message_id }).first()
    if (existing) return existing
  }
  const [row] = await db('inbound_messages').insert(data).returning('*')
  return row
}
