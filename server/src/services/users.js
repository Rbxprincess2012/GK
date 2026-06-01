import { db } from '../db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'

const PUBLIC_COLS = ['id', 'email', 'last_name', 'first_name', 'phone', 'role', 'is_active', 'created_at']

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Какие роли может назначать пользователь с ролью actorRole.
export function assignableRoles(actorRole) {
  if (actorRole === 'superuser') return ['manager', 'director', 'superuser']
  if (actorRole === 'director') return ['manager', 'director'] // суперюзер недоступен
  return []
}

export async function authenticate(email, password) {
  const user = await db('users').where({ email }).first()
  if (!user || !user.is_active) return null
  if (!verifyPassword(password, user.password_hash)) return null
  return publicUser(user)
}

export function publicUser(u) {
  return Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]))
}

export async function getById(id) {
  const u = await db('users').where({ id }).first()
  return u ? publicUser(u) : null
}

// Список с учётом видимости: директор не видит суперюзеров.
export function list(actorRole) {
  let q = db('users').select(PUBLIC_COLS).orderBy('id')
  if (actorRole !== 'superuser') q = q.whereNot('role', 'superuser')
  return q
}

export async function create(data, actorRole) {
  const allowed = assignableRoles(actorRole)
  const role = data.role || 'manager'
  if (!allowed.includes(role)) throw Object.assign(new Error('role_forbidden'), { status: 403 })

  const password = data.password || genPassword()
  const [row] = await db('users').insert({
    email: data.email,
    password_hash: hashPassword(password),
    last_name: data.last_name ?? null,
    first_name: data.first_name ?? null,
    phone: data.phone ?? null,
    role,
    is_active: true,
  }).returning('*')
  return { user: publicUser(row), password: data.password ? undefined : password }
}

// Защита: директор не может трогать суперюзеров и не может выдавать роль суперюзер.
async function assertManageable(id, actorRole) {
  const target = await db('users').where({ id }).first()
  if (!target) throw Object.assign(new Error('not_found'), { status: 404 })
  if (target.role === 'superuser' && actorRole !== 'superuser') {
    throw Object.assign(new Error('not_found'), { status: 404 }) // невидим директору
  }
  return target
}

export async function update(id, patch, actorRole) {
  await assertManageable(id, actorRole)
  if (patch.role) {
    if (!assignableRoles(actorRole).includes(patch.role)) {
      throw Object.assign(new Error('role_forbidden'), { status: 403 })
    }
  }
  const fields = {}
  for (const k of ['last_name', 'first_name', 'phone', 'role', 'is_active']) {
    if (patch[k] !== undefined) fields[k] = patch[k]
  }
  const [row] = await db('users').where({ id }).update(fields).returning('*')
  return publicUser(row)
}

export async function resetPassword(id, actorRole) {
  await assertManageable(id, actorRole)
  const password = genPassword()
  await db('users').where({ id }).update({ password_hash: hashPassword(password) })
  return password
}

export async function remove(id, actorRole, actorId) {
  const target = await assertManageable(id, actorRole)
  if (target.id === actorId) throw Object.assign(new Error('cannot_delete_self'), { status: 400 })
  await db('users').where({ id }).del()
}
