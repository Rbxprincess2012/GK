import { db } from '../db.js'
import { config } from '../config.js'
import { getTokens, getSetting } from './settings.js'

// Ключ Resend и адрес отправителя — из настроек суперпользователя (integration_tokens
// / mail_from), с фолбэком на переменные окружения. Управляется через UI «Токены».
async function mailCfg() {
  let tokens = {}
  let from = config.MAIL_FROM
  try { tokens = (await getTokens()) || {} } catch { /* БД недоступна — env-фолбэк */ }
  try { from = (await getSetting('mail_from')) || from } catch { /* игнор */ }
  return {
    resendKey: tokens.resend_api_key || config.RESEND_API_KEY || null,
    from: from || 'Putevo <onboarding@resend.dev>',
  }
}

// Отправка через Resend HTTP API (порт 443). На VPS SMTP-порты заблокированы
// провайдером, поэтому это основной канал. from должен быть с верифицированного
// домена (напр. noreply@putevo.su) либо тестовый onboarding@resend.dev.
async function deliverResend(row, key, from) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [row.to_email],
      subject: row.subject,
      text: row.body,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`resend ${res.status}: ${txt}`)
  }
}

// Реальная отправка через SMTP (запасной канал, если SMTP-порты доступны).
async function deliverSmtp(row) {
  const { default: nodemailer } = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT || 587,
    secure: config.SMTP_SECURE === 'true',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  })
  await transport.sendMail({
    from: config.MAIL_FROM || config.SMTP_USER,
    to: row.to_email,
    subject: row.subject,
    text: row.body,
  })
}

// Resend (HTTP) в приоритете — он работает на VPS, где SMTP закрыт провайдером.
// Возвращает функцию доставки или null, если канал не настроен.
async function resolveDeliver() {
  const { resendKey, from } = await mailCfg()
  if (resendKey) return (row) => deliverResend(row, resendKey, from)
  if (config.SMTP_HOST) return (row) => deliverSmtp(row)
  return null
}

async function markSent(id, attempts) {
  await db('email_outbox').where({ id }).update({ status: 'sent', sent_at: db.fn.now(), attempts: attempts + 1, error: null })
}
async function markFailed(id, attempts, err) {
  await db('email_outbox').where({ id }).update({ status: 'failed', attempts: attempts + 1, error: String(err?.message || err) })
}

// Кладёт письмо в очередь и (если SMTP настроен) сразу пытается отправить.
// Никогда не бросает наружу — отправка письма не должна ломать основное действие.
export async function sendMail({ to, subject, body, template = null, user_id = null }) {
  let row
  try {
    ;[row] = await db('email_outbox')
      .insert({ to_email: to, subject, body, template, user_id, status: 'pending' })
      .returning('*')
  } catch (e) {
    console.error('[mail] не удалось поставить письмо в очередь:', e.message)
    return null
  }

  const deliver = await resolveDeliver()
  if (!deliver) {
    console.log(`[mail] queued #${row.id} → ${to}: «${subject}» (почта не настроена — письмо в очереди)`)
    return row
  }

  try { await deliver(row); await markSent(row.id, row.attempts) }
  catch (e) { await markFailed(row.id, row.attempts, e); console.error(`[mail] отправка #${row.id} не удалась:`, e.message) }
  return row
}

// Список писем для админки (видимость очереди ещё до подключения SMTP).
export function list({ status, limit = 100 } = {}) {
  let q = db('email_outbox').orderBy('id', 'desc').limit(limit)
  if (status) q = q.where({ status })
  return q
}

// Повторная попытка для pending/failed — пригодится, когда SMTP уже настроят.
export async function retryPending(limit = 50) {
  const deliver = await resolveDeliver()
  if (!deliver) return 0
  const rows = await db('email_outbox').whereIn('status', ['pending', 'failed']).orderBy('id').limit(limit)
  for (const row of rows) {
    try { await deliver(row); await markSent(row.id, row.attempts) }
    catch (e) { await markFailed(row.id, row.attempts, e) }
  }
  return rows.length
}
