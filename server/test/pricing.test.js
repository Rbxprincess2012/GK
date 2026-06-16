import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())
const api = () => request(app)

describe('цены/скидки подписки', () => {
  it('дефолты + расчёт скидок в публичной витрине', async () => {
    const pub = await api().get('/api/public/pricing')
    expect(pub.status).toBe(200)
    expect(pub.body.base_month).toBe(5000)
    expect(pub.body.trial_days).toBe(7)
    const t3 = pub.body.tiers.find((t) => t.months === 3)
    expect(t3.amount).toBe(14250)        // 5000 × 3 × 0.95
    expect(t3.discount_pct).toBe(5)
    const t12 = pub.body.tiers.find((t) => t.months === 12)
    expect(t12.amount).toBe(48000)       // 5000 × 12 × 0.8
  })

  it('PATCH /pricing меняет базовую цену и триал', async () => {
    const res = await api().patch('/api/pricing').send({ base_month: 8000, trial_days: 14 })
    expect(res.status).toBe(200)
    expect(res.body.base_month).toBe(8000)
    const pub = await api().get('/api/public/pricing')
    expect(pub.body.base_month).toBe(8000)
    expect(pub.body.trial_days).toBe(14)
    expect(pub.body.tiers.find((t) => t.months === 1).amount).toBe(8000)
  })

  it('изменённый trial_days применяется к новому триалу', async () => {
    await api().patch('/api/pricing').send({ trial_days: 30 })
    const cr = await api().post('/api/companies').send({ company_name: 'Y', director_email: 'pd@x.ru' })
    await api().post(`/api/companies/${cr.body.id}/grant`)
    await api().post('/api/auth/register').send({ email: 'pd@x.ru', password: 'newpass123' })
    const u = await db('users').where({ email: 'pd@x.ru' }).first()
    await api().post('/api/auth/verify-code').send({ email: 'pd@x.ru', code: u.verify_code })
    const c = await db('companies').where({ id: cr.body.id }).first()
    const days = Math.round((new Date(c.access_until) - new Date(c.trial_started_at)) / 86400000)
    expect(days).toBe(30)
  })
})
