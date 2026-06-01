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
    .insert({ type: 'ooo', legal_name: 'ООО Тест', default_payment_method: 'cashless' }).returning('*')
  const [d] = await db('districts').insert({ name: 'Прикубанский округ', kind: 'city' }).returning('*')
  const [s] = await db('streets').insert({ name: 'ул. Красная', district_id: d.id }).returning('*')
  return { cl, d, s }
}

describe('objects', () => {
  it('создание со street_id автоматически проставляет district_id', async () => {
    const { cl, d, s } = await fixtures()
    const res = await request(app).post('/api/objects')
      .send({ client_id: cl.id, street_id: s.id, house: '10', informal_name: 'ЖК Маршалл' })
    expect(res.status).toBe(201)
    expect(res.body.district_id).toBe(d.id)
  })

  it('inventory пуст для нового объекта', async () => {
    const { cl } = await fixtures()
    const obj = await request(app).post('/api/objects').send({ client_id: cl.id })
    const inv = await request(app).get(`/api/objects/${obj.body.id}/inventory`)
    expect(inv.status).toBe(200)
    expect(inv.body).toEqual([])
  })
})
