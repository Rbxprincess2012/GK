import { randomBytes, randomInt } from 'node:crypto'
import { db } from '../db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { sendMail } from './mail.js'
import * as tpl from '../lib/emailTemplates.js'

const PUBLIC_COLS = ['id', 'email', 'last_name', 'first_name', 'phone', 'messengers', 'position', 'avatar', 'role', 'is_active', 'company_id', 'nav_permissions', 'created_at']

const INVITE_TTL_DAYS = 7
const CODE_TTL_MIN = 15       // срок жизни кода подтверждения/сброса
const MAX_CODE_ATTEMPTS = 5   // защита от перебора кода

// 6-значный код подтверждения (ведущие нули допустимы).
function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// Одноразовый токен приглашения + срок действия.
function newInvite() {
  return {
    token: randomBytes(32).toString('hex'),
    expires: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  }
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

// Наружу — без хеша и токена; добавляем флаги статуса активации.
export function publicUser(u) {
  const base = Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]))
  base.activated = !!u.password_hash         // сотрудник уже задал пароль
  base.invite_pending = !!u.invite_token     // ждёт активации по ссылке
  base.email_verified = !!u.email_verified   // подтвердил почту кодом
  return base
}

export async function getById(id) {
  const u = await db('users').where({ id }).first()
  return u ? publicUser(u) : null
}

// Список с учётом видимости: директор не видит суперюзеров.
export async function list(actorRole) {
  let q = db('users').orderBy('id')
  if (actorRole !== 'superuser') q = q.whereNot('role', 'superuser')
  const rows = await q
  return rows.map(publicUser)
}

export async function create(data, actorRole) {
  const allowed = assignableRoles(actorRole)
  const role = data.role || 'manager'
  if (!allowed.includes(role)) throw Object.assign(new Error('role_forbidden'), { status: 403 })

  // Директор задаёт только почту — пароль сотрудник установит сам по ссылке.
  const { token, expires } = newInvite()
  const [row] = await db('users').insert({
    email: data.email,
    password_hash: null,
    last_name: data.last_name ?? null,
    first_name: data.first_name ?? null,
    phone: data.phone ?? null,
    messengers: data.messengers ?? [],
    position: data.position ?? null,
    avatar: data.avatar ?? null,
    role,
    is_active: true,
    nav_permissions: data.nav_permissions ?? null,
    invite_token: token,
    invite_expires: expires,
  }).returning('*')
  // Письмо с приглашением (в очередь; уйдёт, когда настроим SMTP).
  await sendMail({ to: row.email, user_id: row.id, ...tpl.accountInvite({ email: row.email, token }) })
  // invite_url возвращаем директору как запасной канал, пока почта не подключена.
  return { user: publicUser(row), invite_url: tpl.inviteLink(token) }
}

// Данные приглашения для страницы установки пароля (публично, по токену).
export async function getInvite(token) {
  if (!token) return null
  const u = await db('users').where({ invite_token: token }).first()
  if (!u) return null
  const expired = u.invite_expires ? new Date(u.invite_expires) < new Date() : false
  return { email: u.email, expired }
}

// Установка пароля по токену → активация (и для первичного входа, и для сброса).
export async function setPasswordByToken(token, password) {
  const u = await db('users').where({ invite_token: token }).first()
  if (!u) throw Object.assign(new Error('invalid_token'), { status: 400 })
  if (u.invite_expires && new Date(u.invite_expires) < new Date()) {
    throw Object.assign(new Error('token_expired'), { status: 400 })
  }
  if (!u.is_active) throw Object.assign(new Error('user_inactive'), { status: 403 })
  const [row] = await db('users').where({ id: u.id })
    .update({ password_hash: hashPassword(password), invite_token: null, invite_expires: null })
    .returning('*')
  return publicUser(row)
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

export async function update(id, patch, actorRole, actorId = null) {
  const target = await assertManageable(id, actorRole)
  if (patch.role) {
    if (!assignableRoles(actorRole).includes(patch.role)) {
      throw Object.assign(new Error('role_forbidden'), { status: 403 })
    }
    // Свою роль менять нельзя (нельзя разжаловать/удалить собственную роль).
    if (actorId != null && id === actorId && patch.role !== target.role) {
      throw Object.assign(new Error('cannot_change_own_role'), { status: 403 })
    }
  }
  const fields = {}
  for (const k of ['last_name', 'first_name', 'phone', 'messengers', 'position', 'avatar', 'role', 'is_active', 'nav_permissions']) {
    if (patch[k] !== undefined) fields[k] = patch[k]
  }
  const [row] = await db('users').where({ id }).update(fields).returning('*')
  return publicUser(row)
}

// Сброс пароля: выдаём новую ссылку (сотрудник сам задаёт пароль). Старый пароль
// действует, пока новый не установлен. Возвращаем ссылку как запасной канал.
export async function resetPassword(id, actorRole) {
  const target = await assertManageable(id, actorRole)
  const { token, expires } = newInvite()
  await db('users').where({ id }).update({ invite_token: token, invite_expires: expires })
  await sendMail({ to: target.email, user_id: id, ...tpl.passwordResetLink({ email: target.email, token }) })
  return tpl.inviteLink(token)
}

export async function remove(id, actorRole, actorId) {
  const target = await assertManageable(id, actorRole)
  if (target.id === actorId) throw Object.assign(new Error('cannot_delete_self'), { status: 400 })
  await db('users').where({ id }).del()
}

// ───────────────────────── Саморегистрация по коду (эпик #3) ─────────────────────────

// Проверка кода + завершение действия (finish получает id, возвращает обновлённую строку).
// При неверном коде инкрементит счётчик попыток; истечение/перебор — отдельные ошибки.
async function checkCodeAndFinish(u, code, finish) {
  if (u.verify_expires && new Date(u.verify_expires) < new Date()) {
    throw Object.assign(new Error('code_expired'), { status: 400 })
  }
  if ((u.verify_attempts || 0) >= MAX_CODE_ATTEMPTS) {
    throw Object.assign(new Error('too_many_attempts'), { status: 429 })
  }
  if (String(code) !== String(u.verify_code)) {
    await db('users').where({ id: u.id }).increment('verify_attempts', 1)
    throw Object.assign(new Error('invalid_code'), { status: 400 })
  }
  return publicUser(await finish(u.id))
}

// Директор регистрируется сам: email должен быть предварительно разрешён супером
// («Предоставить доступ» создаёт запись role=director без пароля, не подтверждённую).
// Задаём пароль и шлём код на почту. Повторный вызов до подтверждения — переотправка.
export async function registerDirector({ email, password }) {
  const u = await db('users').where({ email }).first()
  if (!u || u.role !== 'director' || u.email_verified) {
    throw Object.assign(new Error('not_granted'), { status: 403 })
  }
  const code = newCode()
  await db('users').where({ id: u.id }).update({
    password_hash: hashPassword(password),
    verify_code: code,
    verify_expires: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    verify_attempts: 0,
    verify_purpose: 'register',
  })
  await sendMail({ to: email, user_id: u.id, ...tpl.verifyCodeEmail({ code, purpose: 'register' }) })
  return { ok: true, email }
}

// Подтверждение кода регистрации → активация (email_verified) + публичный профиль.
export async function verifyRegistration({ email, code }) {
  const u = await db('users').where({ email }).first()
  if (!u || u.verify_purpose !== 'register' || !u.verify_code) {
    throw Object.assign(new Error('no_pending_code'), { status: 400 })
  }
  return checkCodeAndFinish(u, code, async (id) => {
    const [row] = await db('users').where({ id })
      .update({ email_verified: true, verify_code: null, verify_expires: null, verify_attempts: 0, verify_purpose: null })
      .returning('*')
    return row
  })
}

// «Забыл пароль»: шлём код только активному подтверждённому аккаунту. Ответ всегда
// одинаков ({ ok: true }) — не раскрываем, существует ли email.
export async function forgotPassword({ email }) {
  const u = await db('users').where({ email }).first()
  if (u && u.is_active && u.password_hash && u.email_verified) {
    const code = newCode()
    await db('users').where({ id: u.id }).update({
      verify_code: code,
      verify_expires: new Date(Date.now() + CODE_TTL_MIN * 60_000),
      verify_attempts: 0,
      verify_purpose: 'reset',
    })
    await sendMail({ to: email, user_id: u.id, ...tpl.verifyCodeEmail({ code, purpose: 'reset' }) })
  }
  return { ok: true }
}

// Сброс пароля по коду → новый пароль + сессия.
export async function resetPasswordWithCode({ email, code, password }) {
  const u = await db('users').where({ email }).first()
  if (!u || u.verify_purpose !== 'reset' || !u.verify_code) {
    throw Object.assign(new Error('no_pending_code'), { status: 400 })
  }
  return checkCodeAndFinish(u, code, async (id) => {
    const [row] = await db('users').where({ id })
      .update({ password_hash: hashPassword(password), email_verified: true, verify_code: null, verify_expires: null, verify_attempts: 0, verify_purpose: null })
      .returning('*')
    return row
  })
}
