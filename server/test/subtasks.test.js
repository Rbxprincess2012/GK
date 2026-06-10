import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { syncSubtasks, createSubtasksForNewOrder, markSubtask, commitOrderByDriver } from '../src/services/subtasks.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkDriver(name = 'A') { const [d] = await db('drivers').insert({ name }).returning('*'); return d }

// itemDefs: [{ action, section, quantity }]; section — имя участка (или undefined = весь объект)
async function fixture(driverId, itemDefs) {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [ob] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [o] = await db('orders').insert({
    client_id: cl.id, object_id: ob.id, payment_method: 'cashless',
    status: 'in_progress', assigned_driver_id: driverId, shift_date: '2026-06-09',
  }).returning('*')
  const secMap = {}
  for (const d of itemDefs) {
    if (d.section && !secMap[d.section]) {
      const [s] = await db('sections').insert({ object_id: ob.id, name: d.section }).returning('*')
      secMap[d.section] = s.id
    }
  }
  for (const d of itemDefs) {
    await db('order_items').insert({
      order_id: o.id, action: d.action || 'replace', quantity: d.quantity || 1,
      section_id: d.section ? secMap[d.section] : null,
    })
  }
  return { order: o, secMap }
}

describe('subtasks — материализация', () => {
  it('без участков — одна под-задача (section_id null), идемпотентно', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'haul' }])
    await syncSubtasks(order.id)
    await syncSubtasks(order.id)
    const subs = await db('order_subtasks').where({ order_id: order.id })
    expect(subs).toHaveLength(1)
    expect(subs[0].section_id).toBeNull()
  })

  it('по под-задаче на участок, sub_no стабилен', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'replace', section: '58' }, { action: 'replace', section: '63' }])
    const subs = await syncSubtasks(order.id)
    expect(subs).toHaveLength(2)
    expect(subs.map((s) => s.sub_no).sort()).toEqual([1, 2])
  })

  it('createSubtasksForNewOrder: из позиций по участкам (1 запрос)', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'replace', section: '58' }, { action: 'replace', section: '63' }])
    await db('order_subtasks').where({ order_id: order.id }).del() // fixture не создаёт их, но на всякий
    await createSubtasksForNewOrder(order.id)
    const subs = await db('order_subtasks').where({ order_id: order.id }).orderBy('sub_no')
    expect(subs).toHaveLength(2)
    expect(subs.map((s) => s.sub_no)).toEqual([1, 2])
  })

  it('createSubtasksForNewOrder: без позиций → одна null-под-задача', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
    const [ob] = await db('objects').insert({ client_id: cl.id }).returning('*')
    const [o] = await db('orders').insert({ client_id: cl.id, object_id: ob.id, payment_method: 'cashless', status: 'new' }).returning('*')
    await createSubtasksForNewOrder(o.id)
    const subs = await db('order_subtasks').where({ order_id: o.id })
    expect(subs).toHaveLength(1)
    expect(subs[0].section_id).toBeNull()
  })
})

describe('subtasks — коммит', () => {
  it('все done → заявка done', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'replace', section: '58' }])
    const subs = await syncSubtasks(order.id)
    await markSubtask(subs[0].id, { status: 'done', driverId: d.id })
    const res = await commitOrderByDriver(order.id, d.id)
    expect(res.all_done).toBe(true)
    expect(res.order.status).toBe('done')
  })

  it('смешанно → заявка в пул, не-done сброшены в pending, done остались', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'replace', section: '58' }, { action: 'replace', section: '63' }])
    const subs = await syncSubtasks(order.id)
    await markSubtask(subs[0].id, { status: 'done', driverId: d.id })
    await markSubtask(subs[1].id, { status: 'failed', reason_code: 'blocked', driverId: d.id })
    const res = await commitOrderByDriver(order.id, d.id)
    expect(res.all_done).toBe(false)
    expect(res.order.status).toBe('new')
    expect(res.order.assigned_driver_id).toBeNull()
    const after = await db('order_subtasks').where({ order_id: order.id }).orderBy('sub_no')
    expect(after[0].status).toBe('done')
    expect(after[1].status).toBe('pending')
  })

  it('событие order_attempt_committed с результатами по участкам', async () => {
    const d = await mkDriver()
    const { order } = await fixture(d.id, [{ action: 'replace', section: '58' }])
    const subs = await syncSubtasks(order.id)
    await markSubtask(subs[0].id, { status: 'done', driverId: d.id })
    await commitOrderByDriver(order.id, d.id)
    const ev = await db('outbox').where({ order_id: order.id, event_type: 'order_attempt_committed' }).first()
    expect(ev).toBeTruthy()
    expect(ev.payload.all_done).toBe(true)
    expect(ev.payload.results).toHaveLength(1)
  })

  it('чужой водитель → 403; повторный коммит done → already', async () => {
    const a = await mkDriver('A'); const b = await mkDriver('B')
    const { order } = await fixture(a.id, [{ action: 'replace', section: '58' }])
    const subs = await syncSubtasks(order.id)
    await markSubtask(subs[0].id, { status: 'done', driverId: a.id })
    await expect(commitOrderByDriver(order.id, b.id)).rejects.toMatchObject({ status: 403 })
    await commitOrderByDriver(order.id, a.id)
    const res2 = await commitOrderByDriver(order.id, a.id)
    expect(res2.already).toBe(true)
  })
})
