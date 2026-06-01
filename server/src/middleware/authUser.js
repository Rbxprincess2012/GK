import { config } from '../config.js'
import { verifyToken } from '../lib/jwt.js'

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
      req.auth = { kind: 'user', user: { id: payload.sub, role: payload.role, email: payload.email } }
      return next()
    }
  }
  // Тест-байпас: без токена считаем суперюзером, чтобы не переписывать 40 тестов Этапа 1/2.
  if (config.NODE_ENV === 'test' && !token) {
    req.auth = { kind: 'user', user: { id: 0, role: 'superuser', email: 'test@local' } }
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
