import { Router } from 'express'
import * as svc from '../services/outbox.js'
import { requireService } from '../middleware/auth.js'

const r = Router()

// n8n опрашивает невыданные события — под сервисным токеном.
r.get('/pending', requireService, async (req, res, next) => {
  try { res.json(await svc.pending(Number(req.query.limit) || 50)) } catch (e) { next(e) }
})

// n8n подтверждает доставку (после отправки в мессенджер).
r.post('/:id/ack', requireService, async (req, res, next) => {
  try {
    const row = await svc.markSent(Number(req.params.id))
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

export default r
