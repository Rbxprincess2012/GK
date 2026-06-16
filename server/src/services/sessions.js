import { db } from '../db.js'

// Журнал посещений сервиса (раздел супера «Учёт пользователей»). Каждый вход =
// строка app_sessions. Фронт раз в ~60 c шлёт heartbeat (/sessions/ping), пока
// вкладка активна → last_seen_at. Время на сервисе = sum(last_seen_at - started_at).

const clip = (v, n) => (v ? String(v).slice(0, n) : null)

// Открыть сессию при входе. user — публичный профиль (id, company_id).
export async function start(user, req) {
  if (!user?.id) return null
  const fwd = req?.headers?.['x-forwarded-for']
  const ip = clip((fwd ? String(fwd).split(',')[0].trim() : '') || req?.ip || '', 64)
  const ua = clip(req?.headers?.['user-agent'] || '', 255)
  const [row] = await db('app_sessions').insert({
    user_id: user.id,
    company_id: user.company_id || null,
    ip,
    user_agent: ua,
  }).returning('*')
  return row
}

// Heartbeat: продлить активность текущей сессии.
export async function ping(sessionId) {
  if (!sessionId) return
  await db('app_sessions').where({ id: sessionId }).update({ last_seen_at: new Date() })
}
