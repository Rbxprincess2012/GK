import { Router } from 'express'
import * as svc from '../services/channels.js'
import { requireService } from '../middleware/auth.js'
import { issueCodeInput, verifyInput, resolveInput } from '../validators/channel.js'

const r = Router()

// Диспетчер (фронт) выдаёт код привязки — без сервисного токена.
r.post('/onboarding', async (req, res, next) => {
  try { res.status(201).json(await svc.issueCode(issueCodeInput.parse(req.body))) } catch (e) { next(e) }
})

// Список каналов владельца (для фронта).
r.get('/', async (req, res, next) => {
  try {
    const { owner_kind, owner_id } = req.query
    if (!owner_kind || !owner_id) return res.status(400).json({ error: 'missing_params' })
    res.json(await svc.listForOwner({ owner_kind, owner_id: Number(owner_id) }))
  } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await svc.remove(Number(req.params.id)); res.status(204).end() } catch (e) { next(e) }
})

// Дёргается n8n (бот) — под сервисным токеном.
r.post('/verify', requireService, async (req, res, next) => {
  try { res.json(await svc.verifyCode(verifyInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/resolve', requireService, async (req, res, next) => {
  try { res.json(await svc.resolve(resolveInput.parse(req.body))) } catch (e) { next(e) }
})

export default r
