import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function order(status) {
  const [cl] = await db('clients')
    .insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [o] = await db('orders')
    .insert({ client_id: cl.id, object_id: obj.id, payment_method: 'cashless', status }).returning('*')
  return o
}

describe('orders close', () => {
  it('close после done → closed + closed_at', async () => {
    const o = await order('done')
    const res = await request(app).post(`/api/orders/${o.id}/close`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('closed')
    expect(res.body.closed_at).toBeTruthy()
  })

  it('close из new → 409', async () => {
    const o = await order('new')
    const res = await request(app).post(`/api/orders/${o.id}/close`)
    expect(res.status).toBe(409)
  })
})
