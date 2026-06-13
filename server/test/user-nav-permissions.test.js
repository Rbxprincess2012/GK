import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

// Без токена тест-байпас даёт superuser — достаточно для создания пользователей.
describe('эпик #4 — права менеджера на разделы (nav_permissions)', () => {
  it('создание менеджера с nav_permissions сохраняет права', async () => {
    const res = await request(app).post('/api/users')
      .send({ email: 'm@x.ru', role: 'manager', nav_permissions: ['/orders', '/incoming'] })
    expect(res.status).toBe(201)
    expect(res.body.user.nav_permissions).toEqual(['/orders', '/incoming'])
  })

  it('по умолчанию nav_permissions = null (без ограничений)', async () => {
    const res = await request(app).post('/api/users').send({ email: 'm0@x.ru', role: 'manager' })
    expect(res.status).toBe(201)
    expect(res.body.user.nav_permissions).toBeNull()
  })

  it('обновление и сброс nav_permissions', async () => {
    const cr = await request(app).post('/api/users').send({ email: 'm2@x.ru', role: 'manager' })
    const id = cr.body.user.id

    const upd = await request(app).patch(`/api/users/${id}`).send({ nav_permissions: ['/clients'] })
    expect(upd.status).toBe(200)
    expect(upd.body.nav_permissions).toEqual(['/clients'])

    const reset = await request(app).patch(`/api/users/${id}`).send({ nav_permissions: null })
    expect(reset.status).toBe(200)
    expect(reset.body.nav_permissions).toBeNull()
  })
})
