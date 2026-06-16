import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

describe('simple resources', () => {
  it('vehicles: дубль gov_number -> 409', async () => {
    await request(app).post('/api/vehicles').send({ gov_number: 'А001АА' }).expect(201)
    const dup = await request(app).post('/api/vehicles').send({ gov_number: 'А001АА' })
    expect(dup.status).toBe(409)
  })

  it('vehicles: тип машины (kind) — по умолчанию container, можно завести грейфер', async () => {
    const def = await request(app).post('/api/vehicles').send({ gov_number: 'Г100ГГ' }).expect(201)
    expect(def.body.kind).toBe('container')
    const grap = await request(app).post('/api/vehicles')
      .send({ gov_number: 'Г200ГГ', kind: 'grapple' }).expect(201)
    expect(grap.body.kind).toBe('grapple')
  })

  it('containers: создание и фильтр по object_id', async () => {
    const [ct] = await db('container_types').insert({ name: 'Стандартный' }).returning('*')
    const [cl] = await db('clients')
      .insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
    const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
    await request(app).post('/api/containers')
      .send({ number: 'C-1', type_id: ct.id, location: 'object', object_id: obj.id }).expect(201)
    await request(app).post('/api/containers').send({ number: 'C-2', type_id: ct.id }).expect(201)

    const filtered = await request(app).get(`/api/containers?object_id=${obj.id}`)
    expect(filtered.body).toHaveLength(1)
    expect(filtered.body[0].number).toBe('C-1')
  })

  it('streets: поиск по q отдаёт район', async () => {
    const [d] = await db('districts').insert({ name: 'Тестовый округ', kind: 'city' }).returning('*')
    await db('streets').insert([
      { name: 'ул. Красная', district_id: d.id },
      { name: 'ул. Северная', district_id: d.id },
    ])
    const res = await request(app).get('/api/streets?q=Красн')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].district).toBe('Тестовый округ')
  })
})
