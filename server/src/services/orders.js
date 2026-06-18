import { db } from '../db.js'
import { applyMovement } from './inventory.js'
import { enqueue } from './outbox.js'
import { metricsForOrder } from './orderMetrics.js'
import { syncSubtasks, createSubtasksForNewOrder } from './subtasks.js'
import { sendInWorkNotice } from './clientMessaging.js'

// Номер(а) контейнера значимы только для «Заменить»/«Забрать» (забираем существующий).
// Для «Поставить» — null (ставим новый). Пустую строку нормализуем в null.
// Номер контейнера сохраняем для любого действия (менеджер мог указать и при «Установить» —
// пусть так и уйдёт водителю и в отчёт). Пустую строку нормализуем в null.
function containerNumbersFor(it) {
  const v = (it.container_numbers ?? '').trim()
  return v || null
}

async function assembleOrder(q, id) {
  // Заголовочные данные (имена объекта/клиента/водителя/машины) — теми же JOIN'ами,
  // что в listOrders, чтобы единая модалка и проверка пруфов имели полную шапку.
  const order = await q('orders as o')
    .leftJoin('clients as c', 'c.id', 'o.client_id')
    .leftJoin('objects as ob', 'ob.id', 'o.object_id')
    .leftJoin('streets as st', 'st.id', 'ob.street_id')
    .leftJoin('districts as d', 'd.id', 'ob.district_id')
    .leftJoin('drivers as dr', 'dr.id', 'o.assigned_driver_id')
    .leftJoin('vehicles as v', 'v.id', 'o.vehicle_id')
    .leftJoin('trusted_persons as tp', 'tp.id', 'o.trusted_person_id')
    .where('o.id', id)
    .select(
      'o.*',
      'c.nickname as client_nickname', 'c.legal_name as client_legal_name',
      'tp.name as trusted_person_name', 'tp.phone as trusted_person_phone', 'tp.messengers as trusted_person_messengers',
      'ob.informal_name as object_name', 'ob.house as object_house', 'ob.building as object_building',
      'ob.city as city', 'ob.address_raw as address_raw', 'st.name as street_name',
      'ob.lat as lat', 'ob.lng as lng',
      'd.name as district', 'd.alias as district_alias', 'd.id as district_id',
      'dr.name as driver_name',
      'v.gov_number as veh_gov', 'v.model as veh_model',
    )
    .first()
  if (!order) return null
  const items = await q('order_items as oi')
    .leftJoin('container_types as ct', 'ct.id', 'oi.container_type_id')
    .leftJoin('sections as sec', 'sec.id', 'oi.section_id')
    .leftJoin('trusted_persons as itp', 'itp.id', 'oi.trusted_person_id')
    .where('oi.order_id', id)
    .select('oi.*', 'ct.name as type_name', 'sec.name as section_name',
      'itp.name as trusted_person_name', 'itp.phone as trusted_person_phone')
    .orderBy('oi.id')
  for (const it of items) {
    const reqs = await q('order_item_containers').where({ order_item_id: it.id })
    it.requested_container_ids = reqs.map((r) => r.container_id)
  }
  order.items = items
  // Участки объекта — для выпадающего списка в редакторе позиций.
  order.object_sections = await q('sections').where({ object_id: order.object_id }).select('id', 'name').orderBy('name')
  order.movements = await q('container_movements').where({ order_id: id }).orderBy('id')
  order.attachments = await q('attachments').where({ order_id: id }).orderBy('id')
  const subs = await q('order_subtasks as st')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .where('st.order_id', id).orderBy('st.sub_no')
    .select('st.*', 's.name as section_name')
  order.subtasks = subs.map((st) => ({
    ...st,
    attachments: order.attachments.filter((a) => a.subtask_id === st.id),
  }))
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
    .leftJoin('trusted_persons as tp', 'tp.id', 'o.trusted_person_id')
    .select(
      'o.*',
      'c.nickname as client_nickname', 'c.legal_name as client_legal_name',
      'tp.name as trusted_person_name', 'tp.phone as trusted_person_phone', 'tp.messengers as trusted_person_messengers',
      'ob.informal_name as object_name', 'ob.house as object_house', 'ob.building as object_building',
      'ob.city as city', 'ob.address_raw as address_raw', 'st.name as street_name',
      'ob.lat as lat', 'ob.lng as lng',
      'd.name as district', 'd.alias as district_alias', 'd.id as district_id',
      'dr.name as driver_name',
      db.raw(`COALESCE((
        SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id
      ), 0)::int AS containers`),
      // Пустых привезти (Поставить+Заменить) и полных забрать (Заменить+Забрать) —
      // для строки «Взять N / Забрать N» в карточке водителя без догрузки позиций.
      db.raw(`COALESCE((
        SELECT SUM(oi.quantity) FROM order_items oi
        WHERE oi.order_id = o.id AND oi.action IN ('place','replace')
      ), 0)::int AS empties`),
      db.raw(`COALESCE((
        SELECT SUM(oi.quantity) FROM order_items oi
        WHERE oi.order_id = o.id AND oi.action IN ('replace','haul')
      ), 0)::int AS fulls`),
      // Разбивка по участкам для карточек («📍 58 — 2 забрать»), без догрузки заявки.
      db.raw(`COALESCE((
        SELECT json_agg(json_build_object(
          'id', oi.id, 'action', oi.action, 'quantity', oi.quantity,
          'section_id', oi.section_id, 'section_name', sec.name,
          'container_numbers', oi.container_numbers
        ) ORDER BY oi.id)
        FROM order_items oi LEFT JOIN sections sec ON sec.id = oi.section_id
        WHERE oi.order_id = o.id
      ), '[]') AS items`),
    )
    .orderBy('o.number', 'desc')
  if (filter.id) q = q.where('o.id', filter.id)
  if (filter.status) q = q.where('o.status', filter.status)
  if (filter.statuses) {
    const list = Array.isArray(filter.statuses) ? filter.statuses : String(filter.statuses).split(',')
    q = q.whereIn('o.status', list)
  }
  if (filter.shift_date) q = q.where('o.shift_date', filter.shift_date)
  if (filter.shift_from) q = q.where('o.shift_date', '>=', filter.shift_from)
  if (filter.shift_to) q = q.where('o.shift_date', '<=', filter.shift_to)
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
    // Навальный вывоз = любой тип услуги ≠ 'container' (грейфер/газель/самосвал/кастом):
    // без контейнерных позиций, объём = число ходок.
    const isBulk = payload.service_type && payload.service_type !== 'container'
    const [order] = await trx('orders').insert({
      client_id: obj.client_id,
      object_id: payload.object_id,
      trusted_person_id: payload.trusted_person_id ?? null,
      payment_method,
      amount: payload.amount ?? null,
      desired_date: payload.desired_date ?? null,
      desired_time: payload.desired_time ?? null,
      note: payload.note ?? null,
      // Тип услуги = slug типа машины; для навального — число ходок (по умолч. 1).
      service_type: payload.service_type || 'container',
      grapple_runs: isBulk ? (payload.grapple_runs ?? 1) : null,
      status: isDraft ? 'pending_review' : 'new',
      number: isDraft ? null : trx.raw("nextval('orders_number_seq')"),
    }).returning('*')

    // Участки этого объекта — section_id у позиции принимаем только из них (иначе → весь объект).
    const sectionIds = new Set(await trx('sections').where({ object_id: payload.object_id }).pluck('id'))
    // Навальный вывоз не работает с контейнерами — позиции игнорируем (заявка = объект целиком).
    for (const it of (isBulk ? [] : (payload.items || []))) {
      const [item] = await trx('order_items').insert({
        order_id: order.id,
        action: it.action,
        section_id: it.section_id && sectionIds.has(it.section_id) ? it.section_id : null,
        container_type_id: it.container_type_id ?? null,
        quantity: it.quantity,
        waste_class: it.waste_class ?? null,
        container_numbers: containerNumbersFor(it),
        trusted_person_id: it.trusted_person_id ?? null,
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
    await createSubtasksForNewOrder(order.id, trx)
    return assembleOrder(trx, order.id)
  })
}

// Доступность водителя по новой модели графика: активен И НЕ отмечен отсутствующим
// (по умолчанию все на смене; запись в shifts существует только для отсутствий/переопределений).
const ABSENCE = ['absent', 'sick', 'vacation']
async function assertAvailable(driver_id, date, shift_type) {
  const drv = await db('drivers').where({ id: driver_id, is_active: true }).first()
  if (!drv) throw Object.assign(new Error('driver_not_available'), { status: 409 })
  const absent = await db('shifts').where({ driver_id, date, shift_type }).whereIn('status', ABSENCE).first()
  if (absent) throw Object.assign(new Error('driver_not_available'), { status: 409 })
  return drv
}

export async function assign(id, { driver_id, shift_date, shift_type, vehicle_id = null }) {
  const drv = await assertAvailable(driver_id, shift_date, shift_type)
  if (vehicle_id == null) {
    const row = await db('shifts').where({ driver_id, date: shift_date, shift_type }).first()
    vehicle_id = row?.vehicle_id ?? drv.default_vehicle_id ?? null
  }
  // метрики нагрузки (км до базы, заезды, балл) — заезды по вместимости пустых машины
  const metrics = await metricsForOrder(id, { vehicleId: vehicle_id })
  // статус-гард: назначать/переназначать можно только активные заявки
  const [row] = await db('orders').where({ id }).whereIn('status', ['new', 'assigned', 'in_progress'])
    .update({ assigned_driver_id: driver_id, shift_date, shift_type, vehicle_id, status: 'assigned', ...metrics })
    .returning('*')
  if (!row) throw Object.assign(new Error('not_assignable'), { status: 409 })
  await enqueue(db, {
    event_type: 'order_assigned', order_id: id,
    payload: { driver_id, shift_date, shift_type },
    event_key: `assigned:${id}:${driver_id}:${shift_date}:${shift_type}`,
  })
  return row
}

// Отправить распределение дня «на проверку»: assigned → review для даты/смены.
export async function sendToReview({ shift_date, shift_type }) {
  const rows = await db('orders')
    .where({ shift_date, shift_type, status: 'assigned' })
    .update({ status: 'review' }).returning('id')
  return { moved: rows.length }
}

// «Отправить в Работу»: проверенные заявки дня (assigned/review) → in_progress. Затем
// НАПРЯМУЮ (без n8n) рассылаем уведомление «принято в работу»: клиенту и доверенным лицам,
// каждому свой шаблон (sendInWorkNotice). Рассылка — ВНЕ транзакции (HTTP не держит tx);
// сетевые ошибки не валят перевод статусов. sendImpl инъектируется в тестах.
export async function sendToWork({ shift_date, shift_type }, { sendImpl = sendInWorkNotice } = {}) {
  const ids = await db.transaction(async (trx) => {
    const rows = await trx('orders')
      .where({ shift_date, shift_type })
      .whereIn('status', ['assigned', 'review'])
      .update({ status: 'in_progress' }).returning('id')
    return rows.map((r) => r.id)
  })
  let notified = 0, failed = 0
  for (const id of ids) {
    try { const r = await sendImpl(id); notified += r?.sent || 0; failed += r?.failed || 0 } catch { /* не валим перевод */ }
  }
  return { moved: ids.length, notified, failed }
}

// Задать порядок исполнения заявок (приоритет внутри водителя): seq = позиция в списке.
export async function reorderOrders(orderedIds) {
  if (!orderedIds.length) return { reordered: 0 }
  await db.transaction(async (trx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await trx('orders').where({ id: orderedIds[i] }).update({ seq: i })
    }
  })
  return { reordered: orderedIds.length }
}

// Перенести заявку другому водителю, сохранив статус (доски «На проверке» / «В работе»).
export async function moveToDriver(id, { driver_id }) {
  const order = await db('orders').where({ id }).first()
  if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
  const drv = await assertAvailable(driver_id, order.shift_date, order.shift_type)
  const row0 = await db('shifts').where({ driver_id, date: order.shift_date, shift_type: order.shift_type }).first()
  const vehicle_id = row0?.vehicle_id ?? drv?.default_vehicle_id ?? null
  // Пересчёт нагрузки: км до базы + заезды по вместимости пустых новой машины.
  const metrics = await metricsForOrder(id, { vehicleId: vehicle_id })
  const [row] = await db('orders').where({ id }).whereIn('status', ['assigned', 'review', 'in_progress'])
    .update({ assigned_driver_id: driver_id, vehicle_id, ...metrics })
    .returning('*')
  if (!row) throw Object.assign(new Error('not_movable'), { status: 409 })
  return row
}

// Снять назначение: заявка возвращается в нераспределённые (status=new),
// водитель/смена/машина очищаются. Допустимо только из assigned/in_progress.
export async function unassign(id) {
  const prev = await db('orders').where({ id }).first()
  if (!prev) throw Object.assign(new Error('not_found'), { status: 404 })
  const [row] = await db('orders').where({ id }).whereIn('status', ['assigned', 'in_progress'])
    .update({ assigned_driver_id: null, shift_date: null, shift_type: null, vehicle_id: null, status: 'new' })
    .returning('*')
  if (!row) throw Object.assign(new Error('not_unassignable'), { status: 409 })
  await enqueue(db, {
    event_type: 'order_unassigned', order_id: id,
    payload: { driver_id: prev.assigned_driver_id, shift_date: prev.shift_date, shift_type: prev.shift_type },
    event_key: `unassigned:${id}:${prev.assigned_driver_id}:${prev.shift_date}:${prev.shift_type}`,
  })
  return row
}

// Ручное редактирование заявки менеджером: скалярные поля + (опц.) замена позиций.
export async function updateOrder(id, payload) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })

    const patch = {}
    for (const k of ['trusted_person_id', 'payment_method', 'amount', 'desired_date', 'desired_time', 'note']) {
      if (k in payload) patch[k] = payload[k] ?? null
    }
    // Число ходок грейфера — только для грейфер-заявок (для контейнерных поле неактуально).
    if ('grapple_runs' in payload && order.service_type === 'grapple') {
      patch.grapple_runs = payload.grapple_runs ?? 1
    }
    if (Object.keys(patch).length) await trx('orders').where({ id }).update(patch)

    if (payload.items) {
      const hasMoves = await trx('container_movements').where({ order_id: id }).first()
      if (hasMoves) throw Object.assign(new Error('items_locked'), { status: 409 })
      // Заявка уже у водителя/на подтверждении/завершена — замена позиций снесла бы его
      // под-задачи и пруфы (syncSubtasks удаляет pending исчезнувших участков). Блокируем.
      if (['in_progress', 'awaiting_confirmation', 'done', 'closed'].includes(order.status)) {
        throw Object.assign(new Error('items_locked'), { status: 409 })
      }
      const itemIds = (await trx('order_items').where({ order_id: id }).select('id')).map((r) => r.id)
      if (itemIds.length) await trx('order_item_containers').whereIn('order_item_id', itemIds).del()
      await trx('order_items').where({ order_id: id }).del()
      const sectionIds = new Set(await trx('sections').where({ object_id: order.object_id }).pluck('id'))
      for (const it of payload.items) {
        await trx('order_items').insert({
          order_id: id, action: it.action,
          section_id: it.section_id && sectionIds.has(it.section_id) ? it.section_id : null,
          container_type_id: it.container_type_id ?? null,
          quantity: it.quantity, waste_class: it.waste_class ?? null,
          container_numbers: containerNumbersFor(it),
          trusted_person_id: it.trusted_person_id ?? null,
        })
      }
      await syncSubtasks(id, trx)
    }
    return assembleOrder(trx, id)
  })
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

// Мягкая отмена («в архив»): заявка уходит из работы, но остаётся в журнале.
// Никаких физических удалений — историю клиентских заявок храним всегда.
export async function cancelOrder(id) {
  const order = await db('orders').where({ id }).first()
  if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
  if (['done', 'closed', 'cancelled'].includes(order.status)) throw Object.assign(new Error('not_cancellable'), { status: 409 })
  const [row] = await db('orders').where({ id })
    .update({ status: 'cancelled', assigned_driver_id: null, shift_date: null, shift_type: null, vehicle_id: null })
    .returning('*')
  return row
}

// Вернуть отменённую заявку во «Входящие» (cancelled → new).
export async function restoreOrder(id) {
  const [row] = await db('orders').where({ id }).where('status', 'cancelled')
    .update({ status: 'new' }).returning('*')
  if (!row) throw Object.assign(new Error('not_restorable'), { status: 409 })
  return row
}

// Жёсткое удаление — НЕ используется из UI (журнал неудаляем). Оставлено для админ-нужд.
export async function removeOrder(id) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    if (['done', 'closed'].includes(order.status)) throw Object.assign(new Error('cannot_delete_finalized'), { status: 409 })
    const itemIds = (await trx('order_items').where({ order_id: id }).select('id')).map((r) => r.id)
    if (itemIds.length) await trx('order_item_containers').whereIn('order_item_id', itemIds).del()
    await trx('order_items').where({ order_id: id }).del()
    await trx('container_movements').where({ order_id: id }).del()
    await trx('attachments').where({ order_id: id }).del()
    await trx('outbox').where({ order_id: id }).del()
    await trx('orders').where({ id }).del()
    return { ok: true }
  })
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
