import { db } from '../db.js'
import { enqueue } from './outbox.js'

// Материализация под-задач заявки: одна строка на каждый участок среди позиций,
// либо одна с section_id=null (заявка без участков). sub_no стабилен → показ 35.1/35.2.
// Идемпотентно: повторный вызов не плодит дубли, существующие sub_no не меняет.
// done/failed под-задачи не удаляем (история); удаляем только pending исчезнувших участков.
export async function syncSubtasks(orderId, conn = db) {
  const items = await conn('order_items').where({ order_id: orderId }).select('section_id')
  const present = [...new Set(items.map((i) => i.section_id ?? null))]
  const targets = present.length ? present : [null]
  const existing = await conn('order_subtasks').where({ order_id: orderId })
  const existingKeys = new Set(existing.map((s) => s.section_id ?? null))
  let maxNo = existing.reduce((m, s) => Math.max(m, s.sub_no), 0)

  for (const sec of targets) {
    if (!existingKeys.has(sec)) {
      maxNo += 1
      await conn('order_subtasks').insert({ order_id: orderId, section_id: sec, sub_no: maxNo, status: 'pending' })
    }
  }
  for (const s of existing) {
    const sec = s.section_id ?? null
    if (!targets.includes(sec) && s.status === 'pending') {
      await conn('order_subtasks').where({ id: s.id }).del()
    }
  }
  return conn('order_subtasks').where({ order_id: orderId }).orderBy('sub_no')
}

// Быстрый путь для НОВОЙ заявки (нет существующих под-задач): один SQL-запрос вместо
// нескольких round-trip'ов. Одна под-задача на участок среди позиций; если позиций нет — одна null.
export async function createSubtasksForNewOrder(orderId, conn = db) {
  await conn.raw(
    `INSERT INTO order_subtasks (order_id, section_id, sub_no, status)
     SELECT ?, sec, (ROW_NUMBER() OVER (ORDER BY sec NULLS FIRST))::int, 'pending'
     FROM (
       SELECT DISTINCT section_id AS sec FROM order_items WHERE order_id = ?
       UNION
       SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = ?)
     ) t`,
    [orderId, orderId, orderId],
  )
}

// Водитель отмечает исход под-задачи: 'done' (с пруфом) или 'failed' (причина+коммент).
// Проверка владения: под-задача должна принадлежать заявке этого водителя и быть в работе —
// иначе по «устаревшей» кнопке (после переназначения) можно было пометить чужой участок.
export async function markSubtask(subtaskId, { status, reason_code = null, comment = null, driverId = null }) {
  const st = await db('order_subtasks').where({ id: subtaskId }).first()
  if (!st) throw Object.assign(new Error('not_found'), { status: 404 })
  const order = await db('orders').where({ id: st.order_id }).first()
  if (!order || (driverId != null && order.assigned_driver_id !== driverId)) {
    throw Object.assign(new Error('forbidden'), { status: 403 })
  }
  if (!['assigned', 'in_progress'].includes(order.status)) {
    throw Object.assign(new Error('not_active'), { status: 409 })
  }
  const [row] = await db('order_subtasks').where({ id: subtaskId })
    .update({ status, reason_code, comment, completed_by_driver_id: driverId, completed_at: db.fn.now() })
    .returning('*')
  return row
}

// «Завершить заявку»: коммит работы водителя по объекту.
//  - есть хотя бы один done-участок → заявка → 'awaiting_confirmation' (ждёт менеджера);
//    ВСЕ участки (и выполненные, и невыполненные) остаются в заявке — невыполненные
//    менеджер сам разрулит при приёмке (Переназначить / Оставить в Задачах);
//  - ни одного done → вся заявка обратно в пул как 'new' (подтверждать нечего).
// Клиенту уходит событие order_attempt_committed с результатами по участкам.
// Защита: чужой водитель → 403; повторный коммит уже завершённой → no-op (idempotent).
export async function commitOrderByDriver(orderId, driverId) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    if (order.assigned_driver_id !== driverId) throw Object.assign(new Error('forbidden'), { status: 403 })
    if (!['assigned', 'in_progress'].includes(order.status)) {
      const settled = ['awaiting_confirmation', 'done', 'closed'].includes(order.status)
      return { order, all_done: order.status === 'done' || order.status === 'awaiting_confirmation', already: settled }
    }

    const subs = await trx('order_subtasks').where({ order_id: orderId }).orderBy('sub_no')
    const doneSubs = subs.filter((s) => s.status === 'done')
    const notDone = subs.filter((s) => s.status !== 'done')
    const allDone = subs.length > 0 && notDone.length === 0
    const results = subs.map((s) => ({ sub_no: s.sub_no, section_id: s.section_id, status: s.status, reason_code: s.reason_code }))

    await enqueue(trx, {
      event_type: 'order_attempt_committed', order_id: orderId,
      payload: { all_done: allDone, results },
      // Ключ детерминирован по содержимому попытки (а не по Date.now()): повтор того же
      // коммита (ретрай callback'а) дедупится outbox'ом, а новый коммит после переделки
      // имеет иной набор статусов → не дедупится.
      event_key: `commit:${orderId}:${driverId}:${results.map((r) => `${r.sub_no}${r.status}`).join('.')}`,
    })

    // Ни одного выполненного участка — подтверждать нечего, вся заявка обратно в пул.
    if (doneSubs.length === 0) {
      await trx('order_subtasks').where({ order_id: orderId }).whereNot('status', 'done')
        .update({ status: 'pending', reason_code: null, comment: null, completed_at: null, completed_by_driver_id: null })
      await trx('orders').where({ id: orderId })
        .update({ status: 'new', assigned_driver_id: null, shift_date: null, shift_type: null, vehicle_id: null })
      const finalOrder = await trx('orders').where({ id: orderId }).first()
      return { order: finalOrder, all_done: false, carried_over: [] }
    }

    // Заявка ждёт приёмки менеджером; все участки (вкл. невыполненные) остаются в ней.
    await trx('orders').where({ id: orderId }).update({ status: 'awaiting_confirmation' })
    const finalOrder = await trx('orders').where({ id: orderId }).first()
    return { order: finalOrder, all_done: allDone, carried_over: [] }
  })
}

// Перенести один участок (под-задачу) в ОТДЕЛЬНУЮ новую заявку. Используется менеджером
// при приёмке для невыполненных участков: «Оставить в Задачах» (assign=null → новая заявка
// в пул) либо «Переназначить» (новая заявка + assign дату/водителя отдельным вызовом).
// Переносит позиции участка, саму под-задачу и её вложения. Возвращает дочернюю заявку.
async function carryOverSubtaskTx(trx, st, order) {
  const [child] = await trx('orders').insert({
    client_id: order.client_id,
    object_id: order.object_id,
    trusted_person_id: order.trusted_person_id,
    payment_method: order.payment_method,
    amount: null, // сумму «остаточной» заявки менеджер задаст при распределении
    desired_date: order.desired_date,
    desired_time: order.desired_time,
    note: order.note,
    status: 'new',
    number: trx.raw("nextval('orders_number_seq')"),
    split_from_order_id: order.id,
  }).returning('*')
  await trx('order_items').where({ order_id: order.id, section_id: st.section_id ?? null }).update({ order_id: child.id })
  await trx('order_subtasks').where({ id: st.id }).update({
    order_id: child.id, sub_no: 1, status: 'pending', proof_status: 'unreviewed',
    reason_code: null, comment: null, completed_at: null, completed_by_driver_id: null,
    review_comment: null, reviewed_by: null, reviewed_at: null,
  })
  await trx('attachments').where({ subtask_id: st.id }).update({ order_id: child.id })
  return child
}
export { carryOverSubtaskTx }

// Обёртка над carryOverSubtaskTx с собственной транзакцией (для роута /carry-over).
export async function carryOverSubtask(subtaskId) {
  return db.transaction(async (trx) => {
    const st = await trx('order_subtasks').where({ id: subtaskId }).first()
    if (!st) throw Object.assign(new Error('not_found'), { status: 404 })
    const order = await trx('orders').where({ id: st.order_id }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    return carryOverSubtaskTx(trx, st, order)
  })
}
