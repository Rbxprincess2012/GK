import { config } from '../config.js'

// Гард для маршрутов, дёргаемых n8n (боты). Если SERVICE_TOKEN не задан —
// в dev гард отключён (пропускает), в проде задаём токен и настраиваем n8n.
export function requireService(req, res, next) {
  if (!config.SERVICE_TOKEN) return next()
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (token !== config.SERVICE_TOKEN) return res.status(401).json({ error: 'unauthorized' })
  next()
}
