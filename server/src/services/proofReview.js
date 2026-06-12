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

// Итог по каждому участку заявки для раздела «Проверка»: исход = решение менеджера.
//  • свои под-задачи: done+accepted → 'accepted'; done → 'done'; иначе → 'pending';
//  • участки, вынесенные в дочерние заявки (split_from): new → 'left_in_pool', иначе → 'reassigned'.
export async function reviewOutcome(orderId) {
  const own = await db('order_subtasks as st')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .where('st.order_id', orderId).orderBy('st.sub_no')
    .select('st.status', 'st.proof_status', 's.name as section_name')
  const kids = await db('orders as o')
    .leftJoin('order_subtasks as st', 'st.order_id', 'o.id')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .leftJoin('drivers as d', 'd.id', 'o.assigned_driver_id')
    .where('o.split_from_order_id', orderId).whereNot('o.status', 'cancelled')
    .select('o.number as child_number', 'o.status as child_status', 'o.shift_date', 'o.desired_date',
      'o.desired_time', 's.name as section_name', 'd.name as driver_name')
  const out = []
  for (const st of own) {
    const outcome = st.status === 'done' ? (st.proof_status === 'accepted' ? 'accepted' : 'done') : 'pending'
    out.push({ section_name: st.section_name || 'Объект целиком', done: st.status === 'done', outcome })
  }
  for (const k of kids) {
    out.push({
      section_name: k.section_name || 'Объект целиком', done: false,
      outcome: k.child_status === 'new' ? 'left_in_pool' : 'reassigned',
      child_number: k.child_number, driver_name: k.driver_name,
      shift_date: k.shift_date, desired_date: k.desired_date, desired_time: k.desired_time,
    })
  }
  return out
}

// Раздел «Проверка» = история: активные (ждут подтверждения) + завершённые (done/closed,
// показываются серыми). Каждая заявка с итогом по участкам (свои + вынесенные в дочерние).
export async function subtasksForReview({ date, driver_id } = {}) {
  let q = db('orders as o')
    .whereIn('o.status', ['awaiting_confirmation', 'done', 'closed'])
    .whereExists(function () { this.select('*').from('order_subtasks as st').whereRaw('st.order_id = o.id') })
  if (date) q = q.where('o.shift_date', date)
  if (driver_id) q = q.where('o.assigned_driver_id', Number(driver_id))
  const ids = (await q.select('o.id').orderBy('o.id', 'desc').limit(200)).map((r) => r.id)
  const orders = await Promise.all(ids.map((id) => getOrder(id)))
  return Promise.all(orders.filter(Boolean).map(async (o) => ({ ...o, review_sections: await reviewOutcome(o.id) })))
}
