import { Router } from 'express'
import * as mail from '../services/mail.js'

const r = Router()

// Очередь исходящих писем (для контроля до подключения почтовой службы).
r.get('/', async (req, res, next) => {
  try { res.json(await mail.list({ status: req.query.status, limit: Number(req.query.limit) || 100 })) }
  catch (e) { next(e) }
})

// Повторно отправить pending/failed (когда SMTP уже настроен).
r.post('/retry', async (req, res, next) => {
  try { res.json({ processed: await mail.retryPending(Number(req.body?.limit) || 50) }) }
  catch (e) { next(e) }
})

export default r
