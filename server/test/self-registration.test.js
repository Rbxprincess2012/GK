import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { hashPassword } from '../src/lib/password.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

// Без токена тест-байпас даёт роль superuser — этого достаточно для /companies.
const api = () => request(app)

async function codeFor(email) {
  const u = await db('users').where({ email }).first()
  return u.verify_code
}

describe('эпик #3 — саморегистрация директора по коду', () => {
  it('grant → register → verify-code → login', async () => {
    // Супер заводит компанию-клиента и предоставляет доступ директору.
    const cr = await api().post('/api/companies').send({ company_name: 'ООО Ромашка', director_email: 'dir@romashka.ru' })
    expect(cr.status).toBe(201)
    const companyId = cr.body.id

    const grant = await api().post(`/api/companies/${companyId}/grant`)
    expect(grant.status).toBe(200)
    expect(grant.body.access_granted).toBe(true)

    // Директор появился: role=director, без пароля, не подтверждён.
    const dir = await db('users').where({ email: 'dir@romashka.ru' }).first()
    expect(dir.role).toBe('director')
    expect(dir.password_hash).toBeNull()
    expect(dir.email_verified).toBe(false)
    expect(dir.company_id).toBe(companyId)

    // Список компаний показывает статус «granted».
    const list = await api().get('/api/companies')
    expect(list.body.find((c) => c.id === companyId).access_status).toBe('granted')

    // Саморегистрация: задаёт пароль → код на почту.
    const reg = await api().post('/api/auth/register').send({ email: 'dir@romashka.ru', password: 'newpass123' })
    expect(reg.status).toBe(200)
    expect(reg.body.ok).toBe(true)

    // До подтверждения кода вход запрещён.
    const early = await api().post('/api/auth/login').send({ email: 'dir@romashka.ru', password: 'newpass123' })
    expect(early.status).toBe(403)
    expect(early.body.error).toBe('email_not_verified')

    // Подтверждение кода → сессия.
    const code = await codeFor('dir@romashka.ru')
    const ver = await api().post('/api/auth/verify-code').send({ email: 'dir@romashka.ru', code })
    expect(ver.status).toBe(200)
    expect(ver.body.token).toBeTruthy()
    expect(ver.body.user.email_verified).toBe(true)

    // Теперь обычный вход работает.
    const login = await api().post('/api/auth/login').send({ email: 'dir@romashka.ru', password: 'newpass123' })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeTruthy()

    // Статус компании стал «active».
    const list2 = await api().get('/api/companies')
    expect(list2.body.find((c) => c.id === companyId).access_status).toBe('active')
  })

  it('регистрация без выданного доступа → 403 not_granted', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'stranger@x.ru', password: 'newpass123' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('not_granted')
  })

  it('неверный код инкрементит попытки; после 5 — 429', async () => {
    const cr = await api().post('/api/companies').send({ company_name: 'X', director_email: 'd2@x.ru' })
    await api().post(`/api/companies/${cr.body.id}/grant`)
    await api().post('/api/auth/register').send({ email: 'd2@x.ru', password: 'newpass123' })

    for (let i = 0; i < 5; i++) {
      const bad = await api().post('/api/auth/verify-code').send({ email: 'd2@x.ru', code: '000000' })
      expect(bad.status).toBe(400)
      expect(bad.body.error).toBe('invalid_code')
    }
    const blocked = await api().post('/api/auth/verify-code').send({ email: 'd2@x.ru', code: '000000' })
    expect(blocked.status).toBe(429)
  })

  it('forgot-password → reset-code меняет пароль', async () => {
    // Активный подтверждённый директор.
    await db('users').insert({
      email: 'active@x.ru', password_hash: hashPassword('oldpass12'),
      role: 'director', is_active: true, email_verified: true,
    })
    const forgot = await api().post('/api/auth/forgot-password').send({ email: 'active@x.ru' })
    expect(forgot.status).toBe(200)
    expect(forgot.body.ok).toBe(true)

    const code = await codeFor('active@x.ru')
    const reset = await api().post('/api/auth/reset-code').send({ email: 'active@x.ru', code, password: 'brandnew12' })
    expect(reset.status).toBe(200)
    expect(reset.body.token).toBeTruthy()

    const login = await api().post('/api/auth/login').send({ email: 'active@x.ru', password: 'brandnew12' })
    expect(login.status).toBe(200)
  })

  it('forgot-password для несуществующего email → тихий ok (не раскрываем)', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nobody@x.ru' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('существующие пользователи (email_verified по умолчанию) логинятся без подтверждения', async () => {
    await db('users').insert({
      email: 'legacy@x.ru', password_hash: hashPassword('legacy123'),
      role: 'manager', is_active: true,
    })
    const login = await api().post('/api/auth/login').send({ email: 'legacy@x.ru', password: 'legacy123' })
    expect(login.status).toBe(200)
    expect(login.body.user.email_verified).toBe(true)
  })
})
