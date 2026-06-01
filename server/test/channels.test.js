import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

describe('channels — онбординг / verify / resolve', () => {
  it('issueCode → verify → resolve находит владельца', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'ЖК Маршалл', default_payment_method: 'cashless' }).returning('*')

    const issued = await request(app).post('/api/channels/onboarding')
      .send({ owner_kind: 'client', owner_id: cl.id })
    expect(issued.status).toBe(201)
    expect(issued.body.code).toMatch(/^\d{6}$/)

    const verified = await request(app).post('/api/channels/verify')
      .send({ type: 'telegram', external_id: 'tg-12345', code: issued.body.code })
    expect(verified.status).toBe(200)
    expect(verified.body.external_id).toBe('tg-12345')
    expect(verified.body.verified_at).toBeTruthy()

    const resolved = await request(app).post('/api/channels/resolve')
      .send({ type: 'telegram', external_id: 'tg-12345' })
    expect(resolved.status).toBe(200)
    expect(resolved.body.owner_kind).toBe('client')
    expect(resolved.body.owner.id).toBe(cl.id)
  })

  it('неверный код → 400', async () => {
    const res = await request(app).post('/api/channels/verify')
      .send({ type: 'telegram', external_id: 'tg-1', code: '000000' })
    expect(res.status).toBe(400)
  })

  it('resolve неизвестного chat_id → null', async () => {
    const res = await request(app).post('/api/channels/resolve')
      .send({ type: 'telegram', external_id: 'nope' })
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('issueCode для несуществующего владельца → 404', async () => {
    const res = await request(app).post('/api/channels/onboarding')
      .send({ owner_kind: 'driver', owner_id: 99999 })
    expect(res.status).toBe(404)
  })
})
