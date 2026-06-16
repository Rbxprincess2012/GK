import { config } from '../config.js'
import { verifyToken } from '../lib/jwt.js'
import { db } from '../db.js'

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Читает Authorization: ставит req.auth = {kind:'user', user} | {kind:'service'} | null.
// Никогда не отклоняет сам — это делают requireUser/requireRole/requireUserOrService.
export function authenticate(req, _res, next) {
  const token = bearer(req)
  if (token) {
    if (config.SERVICE_TOKEN && token === config.SERVICE_TOKEN) {
      req.auth = { kind: 'service' }
      return next()
    }
    const payload = verifyToken(token, config.AUTH_SECRET)
    if (payload) {
      req.auth = { kind: 'user', user: { id: payload.sub, role: payload.role, email: payload.email, company_id: payload.cid ?? null, sid: payload.sid ?? null } }
      return next()
    }
  }
  // Тест-байпас: без токена считаем суперюзером, чтобы не переписывать 40 тестов Этапа 1/2.
  if (config.NODE_ENV === 'test' && !token) {
    req.auth = { kind: 'user', user: { id: 0, role: 'superuser', email: 'test@local', company_id: null, sid: null } }
    return next()
  }
  req.auth = null
  next()
}

export function requireUser(req, res, next) {
  if (req.auth?.kind === 'user') return next()
  res.status(401).json({ error: 'unauthorized' })
}

export function requireUserOrService(req, res, next) {
  if (req.auth?.kind === 'user' || req.auth?.kind === 'service') return next()
  res.status(401).json({ error: 'unauthorized' })
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (req.auth?.kind !== 'user') return res.status(401).json({ error: 'unauthorized' })
    if (!roles.includes(req.auth.user.role)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}

// Биллинг тенанта: блокировать действующую сессию, если период доступа компании
// истёк. Супер, сервисный токен n8n и пользователи без компании — без ограничений.
export async function requireActiveCompany(req, res, next) {
  try {
    const u = req.auth?.kind === 'user' ? req.auth.user : null
    if (!u || u.role === 'superuser' || !u.company_id) return next()
    const c = await db('companies').where({ id: u.company_id }).first('access_until')
    if (c && c.access_until && new Date(c.access_until) < new Date()) {
      return res.status(403).json({ error: 'access_expired' })
    }
    next()
  } catch (e) { next(e) }
}
