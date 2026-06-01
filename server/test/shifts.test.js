import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function driver(name) {
  const [d] = await db('drivers').insert({ name }).returning('*')
  return d
}

describe('shifts', () => {
  it('upsert идемпотентен (тот же ключ обновляет, не дублирует)', async () => {
    const d = await driver('Иванов')
    await request(app).put('/api/shifts')
      .send({ driver_id: d.id, date: '2026-06-01', shift_type: 'day', status: 'planned' }).expect(200)
    await request(app).put('/api/shifts')
      .send({ driver_id: d.id, date: '2026-06-01', shift_type: 'day', status: 'present' }).expect(200)
    const rows = await db('shifts').where({ driver_id: d.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('present')
  })

  it('available возвращает только present', async () => {
    const a = await driver('Петров')
    const b = await driver('Сидоров')
    await request(app).put('/api/shifts').send({ driver_id: a.id, date: '2026-06-02', shift_type: 'day', status: 'present' })
    await request(app).put('/api/shifts').send({ driver_id: b.id, date: '2026-06-02', shift_type: 'day', status: 'sick' })
    const res = await request(app).get('/api/shifts/available?date=2026-06-02&shift_type=day')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Петров')
  })
})
