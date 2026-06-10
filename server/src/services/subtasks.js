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
export async function markSubtask(subtaskId, { status, reason_code = null, comment = null, driverId = null }) {
  const [row] = await db('order_subtasks').where({ id: subtaskId })
    .update({ status, reason_code, comment, completed_by_driver_id: driverId, completed_at: db.fn.now() })
    .returning('*')
  return row
}

// «Завершить заявку»: коммит всей работы по объекту.
//  - все под-задачи done → заявка done;
//  - смешанно/не всё → заявка обратно в пул (unassigned), не-done под-задачи сброшены в pending;
//  - done под-задачи остаются закрытыми навсегда.
// Клиенту уходит событие order_attempt_committed с результатами по участкам.
// Защита: чужой водитель → 403; повторный коммит уже завершённой → no-op (idempotent).
export async function commitOrderByDriver(orderId, driverId) {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    if (order.assigned_driver_id !== driverId) throw Object.assign(new Error('forbidden'), { status: 403 })
    if (!['assigned', 'in_progress'].includes(order.status)) {
      return { order, all_done: order.status === 'done', already: true }
    }

    const subs = await trx('order_subtasks').where({ order_id: orderId }).orderBy('sub_no')
    const allDone = subs.length > 0 && subs.every((s) => s.status === 'done')
    const results = subs.map((s) => ({ sub_no: s.sub_no, section_id: s.section_id, status: s.status, reason_code: s.reason_code }))

    await enqueue(trx, {
      event_type: 'order_attempt_committed', order_id: orderId,
      payload: { all_done: allDone, results },
      event_key: `commit:${orderId}:${driverId}:${Date.now()}`,
    })

    if (allDone) {
      await trx('orders').where({ id: orderId }).update({ status: 'done', done_at: trx.fn.now() })
    } else {
      await trx('order_subtasks').where({ order_id: orderId }).whereNot('status', 'done')
        .update({ status: 'pending', reason_code: null, comment: null, completed_at: null, completed_by_driver_id: null })
      await trx('orders').where({ id: orderId })
        .update({ status: 'new', assigned_driver_id: null, shift_date: null, shift_type: null, vehicle_id: null })
    }
    const finalOrder = await trx('orders').where({ id: orderId }).first()
    return { order: finalOrder, all_done: allDone }
  })
}
