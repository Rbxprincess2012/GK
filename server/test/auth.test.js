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

async function mkUser(role, email, password = 'pw123456') {
  const [u] = await db('users').insert({
    email, password_hash: hashPassword(password), role, is_active: true,
  }).returning('*')
  return u
}
const tokenFor = (u) => signToken({ sub: u.id, role: u.role, email: u.email }, config.AUTH_SECRET)
const auth = (req, u) => req.set('Authorization', `Bearer ${tokenFor(u)}`)

describe('auth — логин', () => {
  it('верные креды → токен + пользователь', async () => {
    await mkUser('director', 'd@x.ru', 'secret1')
    const res = await request(app).post('/api/auth/login').send({ email: 'd@x.ru', password: 'secret1' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('director')
    expect(res.body.user.password_hash).toBeUndefined()
  })

  it('неверный пароль → 401', async () => {
    await mkUser('manager', 'm@x.ru', 'secret1')
    const res = await request(app).post('/api/auth/login').send({ email: 'm@x.ru', password: 'nope' })
    expect(res.status).toBe(401)
  })

  it('/me возвращает пользователя и назначаемые роли', async () => {
    const d = await mkUser('director', 'd2@x.ru')
    const res = await auth(request(app).get('/api/auth/me'), d)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('d2@x.ru')
    expect(res.body.assignable_roles).toEqual(['manager', 'director'])
  })
})

describe('users — видимость и гарды ролей', () => {
  it('директор не видит суперюзеров в списке', async () => {
    await mkUser('superuser', 'su@x.ru')
    await mkUser('manager', 'm3@x.ru')
    const d = await mkUser('director', 'd3@x.ru')

    const res = await auth(request(app).get('/api/users'), d)
    expect(res.status).toBe(200)
    const roles = res.body.map((u) => u.role)
    expect(roles).not.toContain('superuser')
    expect(roles).toContain('manager')
  })

  it('директор НЕ может создать суперюзера → 403', async () => {
    const d = await mkUser('director', 'd4@x.ru')
    const res = await auth(request(app).post('/api/users'), d)
      .send({ email: 'new@x.ru', role: 'superuser' })
    expect(res.status).toBe(403)
  })

  it('директор может создать менеджера (через приглашение по ссылке)', async () => {
    const d = await mkUser('director', 'd5@x.ru')
    const res = await auth(request(app).post('/api/users'), d)
      .send({ email: 'mgr@x.ru', role: 'manager', first_name: 'Иван' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('manager')
    // Пароль не возвращается: менеджер задаёт его сам по ссылке-приглашению.
    expect(res.body.user.invite_pending).toBe(true)
    expect(res.body.user.activated).toBe(false)
    expect(res.body.invite_url).toMatch(/.+/)
  })

  it('директору суперюзер невидим при изменении → 404', async () => {
    const su = await mkUser('superuser', 'su2@x.ru')
    const d = await mkUser('director', 'd6@x.ru')
    const res = await auth(request(app).patch(`/api/users/${su.id}`), d).send({ phone: '123' })
    expect(res.status).toBe(404)
  })

  it('менеджер не имеет доступа к /users → 403', async () => {
    const m = await mkUser('manager', 'm7@x.ru')
    const res = await auth(request(app).get('/api/users'), m)
    expect(res.status).toBe(403)
  })

  it('без токена в проде — 401 (тест-байпас не срабатывает при невалидном токене)', async () => {
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer garbage')
    expect(res.status).toBe(401)
  })
})
