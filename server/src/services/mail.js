import { db } from '../db.js'
import { config, mailEnabled } from '../config.js'

// Реальная отправка через SMTP. nodemailer ставится, когда настроим почтовую службу.
async function deliver(row) {
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

  if (!mailEnabled) {
    console.log(`[mail] queued #${row.id} → ${to}: «${subject}» (SMTP не настроен — письмо в очереди)`)
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
  if (!mailEnabled) return 0
  const rows = await db('email_outbox').whereIn('status', ['pending', 'failed']).orderBy('id').limit(limit)
  for (const row of rows) {
    try { await deliver(row); await markSent(row.id, row.attempts) }
    catch (e) { await markFailed(row.id, row.attempts, e) }
  }
  return rows.length
}
