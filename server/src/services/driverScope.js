import { db } from '../db.js'
import { listOrders } from './orders.js'

// Изоляция водителя — на сервере. Бот всегда резолвит chat_id → driver_id и зовёт ЭТИ функции;
// фильтр assigned_driver_id форсируется здесь, а не приходит как доверенный параметр.
// Заявки водителя (опц. на дату, опц. по статусам), по порядку seq.
// ВАЖНО: водитель видит заявку в работе только после «Отправить в работу» (status=in_progress),
// а не сразу после распределения (assigned) — распределение/проверка остаются у менеджера.
export async function ordersForDriver(driverId, { date, statuses } = {}) {
  const filter = { assigned_driver_id: driverId }
  if (date) filter.shift_date = date
  if (statuses) filter.statuses = statuses
  const rows = await listOrders(filter)
  return rows.sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9))
}

// Проверка владения заявкой: чужая → 403. Возвращает заявку, если своя.
export async function assertOwnership(orderId, driverId) {
  const o = await db('orders').where({ id: orderId }).first()
  if (!o || o.assigned_driver_id !== driverId) throw Object.assign(new Error('forbidden'), { status: 403 })
  return o
}

// Полная карточка заявки для бота: адрес/координаты/объект + позиции (с участками) + под-задачи.
// С проверкой владения. null — если не найдена.
export async function orderCardForDriver(orderId, driverId) {
  await assertOwnership(orderId, driverId)
  const rows = await listOrders({ id: orderId })
  const order = rows[0]
  if (!order) return null
  order.items = await db('order_items as oi')
    .leftJoin('sections as s', 's.id', 'oi.section_id')
    .where('oi.order_id', orderId)
    .select('oi.*', 's.name as section_name').orderBy('oi.id')
  order.subtasks = await db('order_subtasks as st')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .where('st.order_id', orderId)
    .select('st.*', 's.name as section_name').orderBy('st.sub_no')
  return order
}
