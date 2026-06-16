import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())
const api = () => request(app)

async function codeFor(email) {
  const u = await db('users').where({ email }).first()
  return u.verify_code
}

// Завести компанию, выдать доступ, зарегистрировать директора и подтвердить код
// (verify-code = первый вход → старт триала). Возвращает { companyId, email, token }.
async function onboardDirector(email = 'dir@billing.ru') {
  const cr = await api().post('/api/companies').send({ company_name: 'ООО Биллинг', director_email: email })
  const companyId = cr.body.id
  await api().post(`/api/companies/${companyId}/grant`)
  await api().post('/api/auth/register').send({ email, password: 'newpass123' })
  const code = await codeFor(email)
  const ver = await api().post('/api/auth/verify-code').send({ email, code })
  return { companyId, email, token: ver.body.token }
}

describe('биллинг тенантов', () => {
  it('до первого входа billing_status=granted, триал не стартовал', async () => {
    const cr = await api().post('/api/companies').send({ company_name: 'X', director_email: 'd@x.ru' })
    await api().post(`/api/companies/${cr.body.id}/grant`)
    const list = await api().get('/api/companies')
    const c = list.body.find((x) => x.id === cr.body.id)
    expect(c.billing_status).toBe('granted')
    expect(c.trial_started_at).toBeNull()
    expect(c.access_until).toBeNull()
  })

  it('первый вход (verify-code) стартует пробный период', async () => {
    const { companyId } = await onboardDirector()
    const c = await db('companies').where({ id: companyId }).first()
    expect(c.trial_started_at).not.toBeNull()
    expect(c.is_trial).toBe(true)
    expect(new Date(c.access_until) > new Date()).toBe(true)
    const list = await api().get('/api/companies')
    expect(list.body.find((x) => x.id === companyId).billing_status).toBe('trial')
  })

  it('продление на 3 месяца → активна, оплата записана с ценой из pricing', async () => {
    const { companyId } = await onboardDirector()
    const before = await db('companies').where({ id: companyId }).first()
    const res = await api().post(`/api/companies/${companyId}/extend`).send({ months: 3 })
    expect(res.status).toBe(200)
    expect(res.body.is_trial).toBe(false)
    expect(new Date(res.body.access_until) > new Date(before.access_until)).toBe(true)
    const pay = await db('company_payments').where({ company_id: companyId }).first()
    expect(pay.months).toBe(3)
    expect(Number(pay.amount)).toBe(14250)   // 5000 × 3 × 0.95
    expect(Number(pay.discount_pct)).toBe(5)
    const list = await api().get('/api/companies')
    expect(list.body.find((x) => x.id === companyId).billing_status).toBe('active')
  })

  it('истёкший период: вход блокируется (403 access_expired)', async () => {
    const { companyId, email } = await onboardDirector('exp@x.ru')
    await db('companies').where({ id: companyId }).update({ access_until: new Date(Date.now() - 86400000), is_trial: false })
    const login = await api().post('/api/auth/login').send({ email, password: 'newpass123' })
    expect(login.status).toBe(403)
    expect(login.body.error).toBe('access_expired')
  })

  it('истёкший период: действующий токен тоже блокируется middleware', async () => {
    const { companyId, token } = await onboardDirector('exp2@x.ru')
    await db('companies').where({ id: companyId }).update({ access_until: new Date(Date.now() - 1000), is_trial: false })
    const res = await api().get('/api/clients').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('access_expired')
  })

  it('продление из истёкшего отсчитывает период от now', async () => {
    const { companyId } = await onboardDirector('exp3@x.ru')
    await db('companies').where({ id: companyId }).update({ access_until: new Date(Date.now() - 30 * 86400000) })
    await api().post(`/api/companies/${companyId}/extend`).send({ months: 1 })
    const c = await db('companies').where({ id: companyId }).first()
    expect(new Date(c.access_until) > new Date()).toBe(true)
  })

  it('супер и пользователи без компании биллингом не ограничены', async () => {
    // тест-байпас (без токена) = superuser без компании → доступ к защищённым роутам открыт
    const res = await api().get('/api/clients')
    expect(res.status).toBe(200)
  })
})

describe('журнал посещений', () => {
  it('вход создаёт сессию; ping и статистика отражают активность', async () => {
    const { companyId, token } = await onboardDirector('sess@x.ru')
    const sess = await db('app_sessions').where({ company_id: companyId })
    expect(sess.length).toBeGreaterThanOrEqual(1)

    const ping = await api().post('/api/sessions/ping').set('Authorization', `Bearer ${token}`)
    expect(ping.status).toBe(200)
    expect(ping.body.ok).toBe(true)

    const stats = await api().get(`/api/companies/${companyId}/stats`)
    expect(stats.body.totals.visits).toBeGreaterThanOrEqual(1)
    expect(stats.body.by_user.length).toBeGreaterThanOrEqual(1)

    const list = await api().get('/api/companies')
    expect(list.body.find((x) => x.id === companyId).stats.visits).toBeGreaterThanOrEqual(1)
  })
})
