import { db } from '../db.js'
import { sendMail } from './mail.js'
import * as tpl from '../lib/emailTemplates.js'

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

export async function list() {
  const rows = await db('companies').orderBy('id')
  const emails = rows.map((r) => r.director_email).filter(Boolean)
  const dirs = emails.length
    ? await db('users').whereIn('email', emails).select('email', 'password_hash', 'email_verified')
    : []
  const byEmail = Object.fromEntries(dirs.map((d) => [d.email, d]))
  return rows.map((r) => ({ ...r, access_status: deriveStatus(r, byEmail[r.director_email]) }))
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
