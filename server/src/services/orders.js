import { db } from '../db.js'
import { applyMovement } from './inventory.js'
import { enqueue } from './outbox.js'

async function assembleOrder(q, id) {
  const order = await q('orders').where({ id }).first()
  if (!order) return null
  const items = await q('order_items').where({ order_id: id }).orderBy('id')
  for (const it of items) {
    const reqs = await q('order_item_containers').where({ order_item_id: it.id })
    it.requested_container_ids = reqs.map((r) => r.container_id)
  }
  order.items = items
  order.movements = await q('container_movements').where({ order_id: id }).orderBy('id')
  order.attachments = await q('attachments').where({ order_id: id }).orderBy('id')
  return order
}

export const getOrder = (id) => assembleOrder(db, id)

export function listOrders(filter = {}) {
  let q = db('orders as o')
    .leftJoin('clients as c', 'c.id', 'o.client_id')
    .leftJoin('objects as ob', 'ob.id', 'o.object_id')
    .leftJoin('streets as st', 'st.id', 'ob.street_id')
    .leftJoin('districts as d', 'd.id', 'ob.district_id')
    .leftJoin('drivers as dr', 'dr.id', 'o.assigned_driver_id')
    .select(
      'o.*',
      'c.nickname as client_nickname', 'c.legal_name as client_legal_name',
      'ob.informal_name as object_name', 'ob.house as object_house', 'st.name as street_name',
      'd.name as district', 'd.alias as district_alias', 'd.id as district_id',
      'dr.name as driver_name',
      db.raw(`COALESCE((
        SELECT SUM(oi.quantity * (CASE oi.action WHEN 'replace' THEN 2 ELSE 1 END))
        FROM order_items oi WHERE oi.order_id = o.id
      ), 0)::int AS slots`),
    )
    .orderBy('o.number', 'desc')
  if (filter.status) q = q.where('o.status', filter.status)
  if (filter.shift_date) q = q.where('o.shift_date', filter.shift_date)
  if (filter.assigned_driver_id) q = q.where('o.assigned_driver_id', filter.assigned_driver_id)
  if (filter.district_id) q = q.where('ob.district_id', filter.district_id)
  return q
}

export async function createOrder(payload) {
  return db.transaction(async (trx) => {
    const obj = await trx('objects').where({ id: payload.object_id }).first()
    if (!obj) throw Object.assign(new Error('object_not_found'), { status: 404 })
    const client = await trx('clients').where({ id: obj.client_id }).first()
    const payment_method = payload.payment_method ?? client.default_payment_method

    // Черновики от бота (pending_review) НЕ получают номер — он присваивается при accept.
    // Обычные (new) нумеруются сразу из последовательности.
    const isDraft = payload.status === 'pending_review'
    const [order] = await trx('orders').insert({
      client_id: obj.client_id,
      object_id: payload.object_id,
      payment_method,
      desired_date: payload.desired_date ?? null,
      desired_time: payload.desired_time ?? null,
      note: payload.note ?? null,
      status: isDraft ? 'pending_review' : 'new',
      number: isDraft ? null : trx.raw("nextval('orders_number_seq')"),
    }).returning('*')

    for (const it of payload.items) {
      const [item] = await trx('order_items').insert({
        order_id: order.id,
        action: it.action,
        container_type_id: it.container_type_id,
        quantity: it.quantity,
        waste_class: it.waste_class ?? null,
      }).returning('*')

      if (it.requested_container_ids?.length) {
        const onObject = await trx('containers')
          .whereIn('id', it.requested_container_ids)
          .andWhere({ object_id: payload.object_id, location: 'object' })
        if (onObject.length !== it.requested_container_ids.length) {
          throw Object.assign(new Error('container_not_on_object'), { status: 409 })
        }
        await trx('order_item_containers').insert(
          it.requested_container_ids.map((cid) => ({ order_item_id: item.id, container_id: cid })))
      }
    }
    return assembleOrder(trx, order.id)
  })
}

export async function assign(id, { driver_id, shift_date, shift_type, vehicle_id = null }) {
  const present = await db('shifts')
    .where({ driver_id, date: shift_date, shift_type, status: 'present' }).first()
  if (!present) throw Object.assign(new Error('driver_not_available'), { status: 409 })
  // статус-гард: назначать/переназначать можно только активные заявки
  const [row] = await db('orders').where({ id }).whereIn('status', ['new', 'assigned', 'in_progress'])
    .update({ assigned_driver_id: driver_id, shift_date, shift_type, vehicle_id, status: 'assigned' })
    .returning('*')
  if (!row) throw Object.assign(new Error('not_assignable'), { status: 409 })
  await enqueue(db, {
    event_type: 'order_assigned', order_id: id,
    payload: { driver_id, shift_date, shift_type },
    event_key: `assigned:${id}:${driver_id}:${shift_date}:${shift_type}`,
  })
  return row
}

export async function complete(id, { movements = [], attachments = [] }) {
  await db.transaction(async (trx) => {
    const order = await trx('orders').where({ id }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    for (const m of movements) {
      await trx('container_movements').insert({
        order_id: id, container_id: m.container_id, direction: m.direction, object_id: order.object_id,
      })
      await applyMovement(trx, { ...m, object_id: order.object_id })
    }
    for (const a of attachments) await trx('attachments').insert({ order_id: id, ...a })
    await trx('orders').where({ id }).update({ status: 'done', done_at: trx.fn.now() })
    await enqueue(trx, { event_type: 'order_done', order_id: id, payload: {}, event_key: `done:${id}` })
  })
  return getOrder(id)
}

// Этап 2: принять черновик клиента → присвоить номер → статус new → событие клиенту.
export async function accept(id) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id, status: 'pending_review' }).first()
    if (!order) throw Object.assign(new Error('not_pending_review'), { status: 409 })
    const res = await trx.raw("SELECT nextval('orders_number_seq')::int AS n")
    const number = order.number ?? res.rows[0].n
    const [row] = await trx('orders').where({ id })
      .update({ status: 'new', number, accepted_at: trx.fn.now() }).returning('*')
    await enqueue(trx, { event_type: 'order_accepted', order_id: id, payload: { number }, event_key: `accepted:${id}` })
    return row
  })
}

// Этап 2: водитель «Подтвердить выполнение» → done + пруф (без движений контейнеров).
export async function driverConfirm(id, { attachments = [] } = {}) {
  await db.transaction(async (trx) => {
    const order = await trx('orders').where({ id }).whereIn('status', ['assigned', 'in_progress']).first()
    if (!order) throw Object.assign(new Error('not_in_progress'), { status: 409 })
    for (const a of attachments) await trx('attachments').insert({ order_id: id, ...a })
    await trx('orders').where({ id }).update({ status: 'done', done_at: trx.fn.now() })
    await enqueue(trx, { event_type: 'order_done', order_id: id, payload: {}, event_key: `done:${id}` })
  })
  return getOrder(id)
}

// Этап 2: водитель «Не выполнено» → failed + причина (заявку можно переназначить).
export async function fail(id, { reason = null } = {}) {
  const [row] = await db('orders').where({ id }).whereIn('status', ['assigned', 'in_progress'])
    .update({ status: 'failed', fail_reason: reason }).returning('*')
  if (!row) throw Object.assign(new Error('not_failable'), { status: 409 })
  await enqueue(db, {
    event_type: 'order_failed', order_id: id, payload: { reason },
    event_key: `failed:${id}:${row.assigned_driver_id}`,
  })
  return row
}

export async function addAttachment(orderId, data) {
  const order = await db('orders').where({ id: orderId }).first()
  if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
  const [row] = await db('attachments').insert({ order_id: orderId, ...data }).returning('*')
  return row
}

export async function close(id) {
  const order = await db('orders').where({ id }).first()
  if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
  if (order.status !== 'done') throw Object.assign(new Error('not_done'), { status: 409 })
  const [row] = await db('orders').where({ id })
    .update({ status: 'closed', closed_at: db.fn.now() }).returning('*')
  return row
}
