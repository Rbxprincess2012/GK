import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function makeOrder() {
  const [cl] = await db('clients')
    .insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [order] = await db('orders')
    .insert({ client_id: cl.id, object_id: obj.id, payment_method: 'cashless' }).returning('*')
  return order
}

describe('orders assign', () => {
  it('назначение на present-водителя → status assigned', async () => {
    const order = await makeOrder()
    const [drv] = await db('drivers').insert({ name: 'Иванов' }).returning('*')
    await db('shifts').insert({ driver_id: drv.id, date: '2026-06-03', shift_type: 'day', status: 'present' })

    const res = await request(app).post(`/api/orders/${order.id}/assign`)
      .send({ driver_id: drv.id, shift_date: '2026-06-03', shift_type: 'day' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('assigned')
    expect(res.body.assigned_driver_id).toBe(drv.id)
  })

  it('назначение на отсутствующего (sick) → 409', async () => {
    const order = await makeOrder()
    const [drv] = await db('drivers').insert({ name: 'Петров' }).returning('*')
    await db('shifts').insert({ driver_id: drv.id, date: '2026-06-03', shift_type: 'day', status: 'sick' })

    const res = await request(app).post(`/api/orders/${order.id}/assign`)
      .send({ driver_id: drv.id, shift_date: '2026-06-03', shift_type: 'day' })
    expect(res.status).toBe(409)
  })
})
