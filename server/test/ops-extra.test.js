import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function clientObjOrder() {
  const [cl] = await db('clients')
    .insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [o] = await db('orders')
    .insert({ client_id: cl.id, object_id: obj.id, payment_method: 'cashless' }).returning('*')
  return { cl, obj, o }
}

describe('routes / invoices / attachments', () => {
  it('маршрут: остановки нумеруются по порядку', async () => {
    const [drv] = await db('drivers').insert({ name: 'Иванов' }).returning('*')
    const { obj, o } = await clientObjOrder()
    const route = await request(app).post('/api/routes')
      .send({ driver_id: drv.id, date: '2026-06-05', shift_type: 'day' })
    expect(route.status).toBe(201)

    const stops = await request(app).put(`/api/routes/${route.body.id}/stops`).send({
      stops: [
        { stop_type: 'object', order_id: o.id, object_id: obj.id },
        { stop_type: 'landfill' },
        { stop_type: 'base' },
      ],
    })
    expect(stops.status).toBe(200)
    expect(stops.body.map((s) => s.seq)).toEqual([1, 2, 3])
    expect(stops.body.map((s) => s.stop_type)).toEqual(['object', 'landfill', 'base'])
  })

  it('счета: создание, фильтр по client_id, оплата', async () => {
    const { cl, o } = await clientObjOrder()
    const inv = await request(app).post('/api/invoices')
      .send({ client_id: cl.id, order_id: o.id, amount: 1500 })
    expect(inv.status).toBe(201)
    expect(inv.body.status).toBe('issued')

    const list = await request(app).get(`/api/invoices?client_id=${cl.id}`)
    expect(list.body).toHaveLength(1)

    const paid = await request(app).patch(`/api/invoices/${inv.body.id}`).send({ status: 'paid' })
    expect(paid.body.status).toBe('paid')
  })

  it('вложения: добавление к заявке', async () => {
    const { o } = await clientObjOrder()
    const res = await request(app).post(`/api/orders/${o.id}/attachments`)
      .send({ kind: 'photo', file_url: 'http://x/1.jpg' })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('photo')
  })
})
