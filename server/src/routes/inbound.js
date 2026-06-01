import { Router } from 'express'
import * as svc from '../services/inbound.js'
import { requireService } from '../middleware/auth.js'
import { inboundInput } from '../validators/inbound.js'

const r = Router()

// n8n сохраняет входящее сообщение (сырьё + транскрипт) — под сервисным токеном.
r.post('/', requireService, async (req, res, next) => {
  try { res.status(201).json(await svc.record(inboundInput.parse(req.body))) } catch (e) { next(e) }
})

export default r
