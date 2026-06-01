import { db } from '../db.js'

// Кладёт исходящее событие в outbox. Идемпотентно по event_key:
// повтор того же перехода не плодит дубль уведомления.
// trx — опционально (внутри транзакции смены статуса).
export async function enqueue(trx, { event_type, order_id = null, payload = {}, event_key }) {
  const q = (trx || db)('outbox')
    .insert({ event_type, order_id, payload, event_key, status: 'pending' })
    .onConflict('event_key').ignore()
  await q
}

// Невыданные события (для поллинга n8n).
export function pending(limit = 50) {
  return db('outbox').where({ status: 'pending' }).orderBy('id').limit(limit)
}

// Пометить доставленным (ack от n8n после успешной отправки в мессенджер).
export async function markSent(id) {
  const [row] = await db('outbox').where({ id }).update({ status: 'sent', delivered_at: db.fn.now() }).returning('*')
  return row
}
