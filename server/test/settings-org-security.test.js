import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { config } from '../src/config.js'
import { signToken } from '../src/lib/jwt.js'
import { hashPassword } from '../src/lib/password.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkUser(role, email) {
  const [u] = await db('users').insert({
    email, password_hash: hashPassword('pw123456'), role, is_active: true,
  }).returning('*')
  return u
}
const auth = (req, u) => req.set('Authorization', `Bearer ${signToken({ sub: u.id, role: u.role, email: u.email }, config.AUTH_SECRET)}`)

// support_chat_id (канал уведомлений ИИ-эскалации супера) — только суперпользователь может
// читать и менять его, хотя сами реквизиты компании (/settings/org) доступны и менеджеру.
describe('settings /org — support_chat_id под суперпользователем', () => {
  it('менеджер НЕ может задать support_chat_id и не видит его', async () => {
    const su = await mkUser('superuser', 'su@x.ru')
    const mgr = await mkUser('manager', 'm@x.ru')
    // супер задаёт канал уведомлений
    await auth(request(app).put('/api/settings/org'), su).send({ company_name: 'Acme', support_chat_id: '111' })

    // менеджер пытается перенаправить на свой чат — поле должно быть проигнорировано
    const put = await auth(request(app).put('/api/settings/org'), mgr).send({ support_chat_id: '999' })
    expect(put.status).toBe(200)
    expect(put.body.support_chat_id).toBeUndefined() // в ответе менеджеру не отдаём

    // в БД остался супер-чат, менеджер его не перетёр
    const org = await db('settings').where({ key: 'org' }).first()
    expect(org.value.support_chat_id).toBe('111')

    // GET менеджеру тоже не отдаёт chat_id
    const get = await auth(request(app).get('/api/settings/org'), mgr)
    expect(get.body.support_chat_id).toBeUndefined()
    expect(get.body.company_name).toBe('Acme') // остальное видит
  })

  it('суперпользователь задаёт и видит support_chat_id', async () => {
    const su = await mkUser('superuser', 'su@x.ru')
    const put = await auth(request(app).put('/api/settings/org'), su).send({ support_chat_id: '777' })
    expect(put.body.support_chat_id).toBe('777')
    const get = await auth(request(app).get('/api/settings/org'), su)
    expect(get.body.support_chat_id).toBe('777')
  })
})
