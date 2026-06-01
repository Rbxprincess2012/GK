import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function fixtures() {
  const [cl] = await db('clients')
    .insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [ct] = await db('container_types').insert({ name: 'Стандартный' }).returning('*')
  const [order] = await db('orders')
    .insert({ client_id: cl.id, object_id: obj.id, payment_method: 'cashless' }).returning('*')
  return { cl, obj, ct, order }
}

describe('orders complete (инвентарь)', () => {
  it('delivered → контейнер на объекте, инвентарь +1, статус done', async () => {
    const { obj, ct, order } = await fixtures()
    const [c] = await db('containers')
      .insert({ number: 'C-1', type_id: ct.id, location: 'warehouse' }).returning('*')

    const res = await request(app).post(`/api/orders/${order.id}/complete`)
      .send({ movements: [{ container_id: c.id, direction: 'delivered' }] })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('done')
    expect(res.body.done_at).toBeTruthy()

    const inv = await request(app).get(`/api/objects/${obj.id}/inventory`)
    expect(inv.body).toHaveLength(1)
    const cont = await db('containers').where({ id: c.id }).first()
    expect(cont.location).toBe('object')
    expect(cont.object_id).toBe(obj.id)
  })

  it('picked_up → контейнер уезжает (in_transit/full), инвентарь пуст', async () => {
    const { obj, ct, order } = await fixtures()
    const [c] = await db('containers')
      .insert({ number: 'C-2', type_id: ct.id, location: 'object', object_id: obj.id, state: 'empty' }).returning('*')

    await request(app).post(`/api/orders/${order.id}/complete`)
      .send({ movements: [{ container_id: c.id, direction: 'picked_up' }] }).expect(200)

    const cont = await db('containers').where({ id: c.id }).first()
    expect(cont.location).toBe('in_transit')
    expect(cont.state).toBe('full')
    expect(cont.object_id).toBeNull()

    const inv = await request(app).get(`/api/objects/${obj.id}/inventory`)
    expect(inv.body).toEqual([])
  })

  it('ошибочное движение откатывает транзакцию (статус не меняется)', async () => {
    const { order } = await fixtures()
    const res = await request(app).post(`/api/orders/${order.id}/complete`)
      .send({ movements: [{ container_id: 999999, direction: 'picked_up' }] })
    expect(res.status).toBe(409) // FK violation

    const row = await db('orders').where({ id: order.id }).first()
    expect(row.status).toBe('new')
    const moves = await db('container_movements').where({ order_id: order.id })
    expect(moves).toHaveLength(0)
  })
})
