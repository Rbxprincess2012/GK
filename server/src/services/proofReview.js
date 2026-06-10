import { db } from '../db.js'
import { getOrder } from './orders.js'
import { onOrderAccepted } from './clientMessaging.js'

const notFound = () => Object.assign(new Error('not_found'), { status: 404 })

// Принять пруф под-задачи. Если после этого ВСЕ под-задачи приняты — приёмка заявки.
export async function acceptSubtask(subtaskId, userId = null) {
  return db.transaction(async (trx) => {
    const st = await trx('order_subtasks').where({ id: subtaskId }).first()
    if (!st) throw notFound()
    await trx('order_subtasks').where({ id: subtaskId }).update({
      proof_status: 'accepted', reviewed_by: userId || null, reviewed_at: trx.fn.now(), review_comment: null,
    })
    await maybeAcceptOrder(st.order_id, userId, trx)
    return trx('order_subtasks').where({ id: subtaskId }).first()
  })
}

// Вернуть пруф на переделку: под-задача → pending+rejected; заявка done → in_progress (тот же водитель).
export async function rejectSubtask(subtaskId, userId, comment) {
  return db.transaction(async (trx) => {
    const st = await trx('order_subtasks').where({ id: subtaskId }).first()
    if (!st) throw notFound()
    await trx('order_subtasks').where({ id: subtaskId }).update({
      status: 'pending', proof_status: 'rejected', review_comment: comment || null,
      reviewed_by: userId || null, reviewed_at: trx.fn.now(),
      reject_count: (st.reject_count || 0) + 1, completed_at: null,
    })
    const order = await trx('orders').where({ id: st.order_id }).first()
    if (order && order.status === 'done') {
      await trx('orders').where({ id: order.id }).update({ status: 'in_progress', done_at: null })
    }
    return trx('order_subtasks').where({ id: subtaskId }).first()
  })
}

// Все под-задачи приняты → заявка done + хук приёмки (token + outbox + лог). Идемпотентно.
async function maybeAcceptOrder(orderId, userId, trx) {
  const subs = await trx('order_subtasks').where({ order_id: orderId })
  if (!subs.length || !subs.every((s) => s.proof_status === 'accepted')) return
  const order = await trx('orders').where({ id: orderId }).first()
  if (order.status !== 'done') {
    await trx('orders').where({ id: orderId }).update({ status: 'done', done_at: order.done_at || trx.fn.now() })
  }
  await onOrderAccepted(orderId, { userId, channels: 'outbox' }, trx)
}

// Очередь проверки: заявки с done-под-задачами, чей пруф ещё не просмотрен.
export async function subtasksForReview({ date, driver_id } = {}) {
  let q = db('orders as o')
    .join('order_subtasks as st', 'st.order_id', 'o.id')
    .where('st.status', 'done').andWhere('st.proof_status', 'unreviewed')
  if (date) q = q.where('o.shift_date', date)
  if (driver_id) q = q.where('o.assigned_driver_id', Number(driver_id))
  const ids = [...new Set((await q.select('o.id')).map((r) => r.id))]
  const orders = await Promise.all(ids.map((id) => getOrder(id)))
  return orders.filter(Boolean)
}
