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

describe('защита ролей пользователей', () => {
  it('директор не видит роль суперпользователя в назначаемых (/auth/me)', async () => {
    const dir = await mkUser('director', 'd@x.ru')
    const me = await auth(request(app).get('/api/auth/me'), dir)
    expect(me.body.assignable_roles).toEqual(['manager', 'director'])
    expect(me.body.assignable_roles).not.toContain('superuser')
  })

  it('директор не может выдать роль суперпользователя', async () => {
    const dir = await mkUser('director', 'd@x.ru')
    const mgr = await mkUser('manager', 'm@x.ru')
    const res = await auth(request(app).patch(`/api/users/${mgr.id}`), dir).send({ role: 'superuser' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('role_forbidden')
  })

  it('нельзя изменить собственную роль', async () => {
    const dir = await mkUser('director', 'd@x.ru')
    const res = await auth(request(app).patch(`/api/users/${dir.id}`), dir).send({ role: 'manager' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('cannot_change_own_role')
    // в БД роль не изменилась
    const row = await db('users').where({ id: dir.id }).first()
    expect(row.role).toBe('director')
  })

  it('ту же роль себе переслать можно (no-op, не считается сменой)', async () => {
    const dir = await mkUser('director', 'd@x.ru')
    const res = await auth(request(app).patch(`/api/users/${dir.id}`), dir).send({ role: 'director', position: 'Главный' })
    expect(res.status).toBe(200)
    expect(res.body.position).toBe('Главный')
  })

  it('чужую роль менять можно', async () => {
    const dir = await mkUser('director', 'd@x.ru')
    const mgr = await mkUser('manager', 'm@x.ru')
    const res = await auth(request(app).patch(`/api/users/${mgr.id}`), dir).send({ role: 'director' })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('director')
  })
})
