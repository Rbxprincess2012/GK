import { db } from '../db.js'
import { sendMail } from './mail.js'
import * as tpl from '../lib/emailTemplates.js'
import { getPricing, quoteFor } from './pricing.js'

// Компании-клиенты SaaS (тенанты). Раздел суперпользователя «Клиенты»: карточка
// с реквизитами + email директора + кнопка «Предоставить доступ» (открывает
// директору саморегистрацию по этому email).

const FIELDS = [
  'company_name', 'legal_name', 'inn', 'kpp', 'ogrn', 'legal_address',
  'phone', 'email', 'bank_name', 'bank_account', 'bik', 'corr_account', 'director_email',
]

function pick(d) {
  const out = {}
  for (const k of FIELDS) if (d[k] !== undefined) out[k] = d[k]
  return out
}

// Статус доступа директора: none → доступ не выдан; granted → выдан, директор ещё
// не задал пароль; registered → пароль задан, ждёт код; active → подтверждён.
function deriveStatus(company, dir) {
  if (!company.access_granted) return 'none'
  if (!dir || !dir.password_hash) return 'granted'
  if (!dir.email_verified) return 'registered'
  return 'active'
}

// Статус подписки (биллинг), отдельно от статуса регистрации директора:
// none → доступ не выдан; granted → выдан, первого входа ещё не было (триал не
// стартовал); trial → идёт пробный период; active → оплачено; expired → срок истёк.
function billingStatus(c) {
  if (!c.access_granted) return 'none'
  if (!c.trial_started_at && !c.access_until) return 'granted'
  if (c.access_until && new Date(c.access_until) < new Date()) return 'expired'
  if (c.is_trial) return 'trial'
  return 'active'
}

// Агрегаты посещений по компаниям одним запросом (для списка «Учёт пользователей»).
async function statsByCompany() {
  const rows = await db('app_sessions')
    .whereNotNull('company_id')
    .groupBy('company_id')
    .select('company_id')
    .count('* as visits')
    .max('started_at as last_login')
    .select(db.raw('COALESCE(SUM(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::bigint AS active_seconds'))
  return Object.fromEntries(rows.map((r) => [r.company_id, {
    visits: Number(r.visits),
    active_seconds: Number(r.active_seconds),
    last_login: r.last_login,
  }]))
}

export async function list() {
  const rows = await db('companies').orderBy('id')
  const emails = rows.map((r) => r.director_email).filter(Boolean)
  const dirs = emails.length
    ? await db('users').whereIn('email', emails).select('email', 'password_hash', 'email_verified')
    : []
  const byEmail = Object.fromEntries(dirs.map((d) => [d.email, d]))
  const stats = await statsByCompany()
  return rows.map((r) => ({
    ...r,
    access_status: deriveStatus(r, byEmail[r.director_email]),
    billing_status: billingStatus(r),
    stats: stats[r.id] || { visits: 0, active_seconds: 0, last_login: null },
  }))
}

// Детальная статистика посещений компании с разбивкой по сотрудникам.
export async function statsForCompany(id) {
  const byUser = await db('app_sessions as s')
    .leftJoin('users as u', 'u.id', 's.user_id')
    .where('s.company_id', id)
    .groupBy('s.user_id', 'u.email', 'u.first_name', 'u.last_name')
    .select('s.user_id', 'u.email', 'u.first_name', 'u.last_name')
    .count('* as visits')
    .max('s.started_at as last_login')
    .select(db.raw('COALESCE(SUM(EXTRACT(EPOCH FROM (s.last_seen_at - s.started_at))), 0)::bigint AS active_seconds'))
    .orderBy('visits', 'desc')
  const totals = byUser.reduce((a, r) => ({
    visits: a.visits + Number(r.visits),
    active_seconds: a.active_seconds + Number(r.active_seconds),
    last_login: !a.last_login || (r.last_login && r.last_login > a.last_login) ? r.last_login : a.last_login,
  }), { visits: 0, active_seconds: 0, last_login: null })
  return {
    totals,
    by_user: byUser.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      name: [r.last_name, r.first_name].filter(Boolean).join(' ') || null,
      visits: Number(r.visits),
      active_seconds: Number(r.active_seconds),
      last_login: r.last_login,
    })),
  }
}

export async function getById(id) {
  const row = await db('companies').where({ id }).first()
  return row || null
}

export async function create(data) {
  const [row] = await db('companies').insert(pick(data)).returning('*')
  return row
}

export async function update(id, data) {
  const [row] = await db('companies').where({ id }).update(pick(data)).returning('*')
  if (!row) throw Object.assign(new Error('not_found'), { status: 404 })
  return row
}

export async function remove(id) {
  await db('companies').where({ id }).del()
}

// «Предоставить доступ»: создаём/привязываем директора с указанным email и
// помечаем компанию access_granted. Директор затем сам регистрируется на витрине.
export async function grantAccess(id) {
  const company = await db('companies').where({ id }).first()
  if (!company) throw Object.assign(new Error('not_found'), { status: 404 })
  const email = (company.director_email || '').trim().toLowerCase()
  if (!email) throw Object.assign(new Error('director_email_required'), { status: 400 })

  const existing = await db('users').where({ email }).first()
  if (existing) {
    // Повторная выдача безопасна, только если это директор без чужой компании.
    if (existing.role !== 'director' || (existing.company_id && existing.company_id !== id)) {
      throw Object.assign(new Error('email_taken'), { status: 409 })
    }
    await db('users').where({ id: existing.id }).update({ company_id: id })
  } else {
    await db('users').insert({
      email,
      role: 'director',
      is_active: true,
      password_hash: null,
      email_verified: false,
      company_id: id,
      messengers: [],
    })
  }
  await db('companies').where({ id }).update({ access_granted: true })
  await sendMail({ to: email, ...tpl.companyAccessGranted({ company: company.company_name || '', email }) })
  return { ...company, access_granted: true }
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + Number(months))
  return d
}

// Вызывается при КАЖДОМ входе пользователя компании (login/verify-code/reset/invite).
// 1) Старт пробного периода на ПЕРВОМ входе (триал отсчитывается отсюда).
// 2) Проверка срока доступа: истёк → { error: 'access_expired' }.
// Супер и пользователи без компании ограничений не имеют.
export async function applyAccessOnLogin(user) {
  if (!user?.company_id) return { ok: true }
  const company = await db('companies').where({ id: user.company_id }).first()
  if (!company) return { ok: true }

  if (company.access_granted && !company.trial_started_at) {
    const { trial_days } = await getPricing()
    const until = addMonths(new Date(), 0) // now
    until.setDate(until.getDate() + Number(trial_days || 7))
    await db('companies').where({ id: company.id }).update({
      trial_started_at: new Date(), access_until: until, is_trial: true,
    })
    company.access_until = until
  }

  if (company.access_until && new Date(company.access_until) < new Date()) {
    return { error: 'access_expired' }
  }
  return { ok: true }
}

// Продление подписки на N месяцев (кнопки «Оплачен 1/3/6/12 мес»). Прибавляет к
// концу текущего периода (триала или прошлой оплаты), если он ещё в будущем —
// иначе отсчёт от now. Пишет строку аудита в company_payments.
export async function extendSubscription(id, months, actorId = null) {
  const company = await db('companies').where({ id }).first()
  if (!company) throw Object.assign(new Error('not_found'), { status: 404 })
  const q = await quoteFor(months)
  const before = company.access_until ? new Date(company.access_until) : null
  const base = before && before > new Date() ? before : new Date()
  const after = addMonths(base, months)

  const [row] = await db('companies').where({ id })
    .update({ access_until: after, is_trial: false }).returning('*')
  await db('company_payments').insert({
    company_id: id,
    months: Number(months),
    amount: q.amount,
    discount_pct: q.discount_pct,
    access_until_before: before,
    access_until_after: after,
    created_by: actorId || null,
  })
  return { ...row, billing_status: 'active' }
}
