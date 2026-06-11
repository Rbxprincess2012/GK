import { db } from '../db.js'
import { getOrder } from './orders.js'

const notFound = () => Object.assign(new Error('not_found'), { status: 404 })

// Принять пруф под-задачи (пометка для менеджера). Финал заявки — отдельной кнопкой
// «Подтверждаю» (confirmOrder), а не авто-приёмкой на последнем пруфе.
export async function acceptSubtask(subtaskId, userId = null) {
  return db.transaction(async (trx) => {
    const st = await trx('order_subtasks').where({ id: subtaskId }).first()
    if (!st) throw notFound()
    await trx('order_subtasks').where({ id: subtaskId }).update({
      proof_status: 'accepted', reviewed_by: userId || null, reviewed_at: trx.fn.now(), review_comment: null,
    })
    return trx('order_subtasks').where({ id: subtaskId }).first()
  })
}

// Вернуть пруф на переделку: под-задача → pending+rejected; заявка из done/awaiting_confirmation
// → in_progress (тот же водитель доснимет участок).
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
    if (order && ['done', 'awaiting_confirmation'].includes(order.status)) {
      await trx('orders').where({ id: order.id }).update({ status: 'in_progress', done_at: null })
    }
    return trx('order_subtasks').where({ id: subtaskId }).first()
  })
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
