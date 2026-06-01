import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function seed() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [type] = await db('container_types').insert({ name: 'Лодочка' }).returning('*')
  return { cl, obj, type }
}
const itemsOf = (type) => [{ action: 'place', container_type_id: type.id, quantity: 1 }]

describe('orders stage2 — черновик / accept / нумерация', () => {
  it('черновик pending_review создаётся без номера', async () => {
    const { obj, type } = await seed()
    const res = await request(app).post('/api/orders')
      .send({ object_id: obj.id, status: 'pending_review', items: itemsOf(type) })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending_review')
    expect(res.body.number).toBeNull()
  })

  it('accept присваивает номер, ставит new и кладёт событие order_accepted', async () => {
    const { obj, type } = await seed()
    const draft = (await request(app).post('/api/orders')
      .send({ object_id: obj.id, status: 'pending_review', items: itemsOf(type) })).body

    const res = await request(app).post(`/api/orders/${draft.id}/accept`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('new')
    expect(res.body.number).toBeGreaterThan(0)
    expect(res.body.accepted_at).toBeTruthy()

    const evt = await db('outbox').where({ event_type: 'order_accepted', order_id: draft.id }).first()
    expect(evt).toBeTruthy()
  })

  it('повторный accept → 409, событие не дублируется', async () => {
    const { obj, type } = await seed()
    const draft = (await request(app).post('/api/orders')
      .send({ object_id: obj.id, status: 'pending_review', items: itemsOf(type) })).body
    await request(app).post(`/api/orders/${draft.id}/accept`)
    const again = await request(app).post(`/api/orders/${draft.id}/accept`)
    expect(again.status).toBe(409)
    const count = await db('outbox').where({ event_type: 'order_accepted', order_id: draft.id }).count()
    expect(Number(count[0].count)).toBe(1)
  })

  it('брошенный черновик не создаёт дыру в нумерации', async () => {
    const { obj, type } = await seed()
    const normal = (await request(app).post('/api/orders').send({ object_id: obj.id, items: itemsOf(type) })).body
    const draft = (await request(app).post('/api/orders')
      .send({ object_id: obj.id, status: 'pending_review', items: itemsOf(type) })).body
    const accepted = (await request(app).post(`/api/orders/${draft.id}/accept`)).body
    expect(accepted.number).toBe(normal.number + 1)
  })
})

describe('orders stage2 — driver-confirm / fail', () => {
  async function assignedOrder() {
    const { obj, type } = await seed()
    const order = (await request(app).post('/api/orders').send({ object_id: obj.id, items: itemsOf(type) })).body
    const [drv] = await db('drivers').insert({ name: 'Иванов' }).returning('*')
    await db('shifts').insert({ driver_id: drv.id, date: '2026-06-03', shift_type: 'day', status: 'present' })
    await request(app).post(`/api/orders/${order.id}/assign`)
      .send({ driver_id: drv.id, shift_date: '2026-06-03', shift_type: 'day' })
    return { order, drv }
  }

  it('driver-confirm → done + пруф + событие order_done', async () => {
    const { order } = await assignedOrder()
    const res = await request(app).post(`/api/orders/${order.id}/driver-confirm`)
      .send({ attachments: [{ kind: 'photo', file_url: 'http://x/y.jpg' }] })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('done')
    const att = await db('attachments').where({ order_id: order.id })
    expect(att.length).toBe(1)
    const evt = await db('outbox').where({ event_type: 'order_done', order_id: order.id }).first()
    expect(evt).toBeTruthy()
    // движений контейнеров быть не должно
    const mv = await db('container_movements').where({ order_id: order.id })
    expect(mv.length).toBe(0)
  })

  it('fail → failed + причина + событие order_failed', async () => {
    const { order } = await assignedOrder()
    const res = await request(app).post(`/api/orders/${order.id}/fail`).send({ reason: 'нет проезда' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('failed')
    expect(res.body.fail_reason).toBe('нет проезда')
    const evt = await db('outbox').where({ event_type: 'order_failed', order_id: order.id }).first()
    expect(evt).toBeTruthy()
  })

  it('driver-confirm на new-заявке (не назначена) → 409', async () => {
    const { obj, type } = await seed()
    const order = (await request(app).post('/api/orders').send({ object_id: obj.id, items: itemsOf(type) })).body
    const res = await request(app).post(`/api/orders/${order.id}/driver-confirm`).send({})
    expect(res.status).toBe(409)
  })
})
