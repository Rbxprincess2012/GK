import { Router } from 'express'
import * as svc from '../services/drafts.js'
import { createDraftInput, rejectDraftInput } from '../validators/draft.js'
import { createOrderInput } from '../validators/order.js'

const r = Router()

r.get('/', async (req, res, next) => {
  try { res.json(await svc.listDrafts(req.query)) } catch (e) { next(e) }
})

r.get('/:id', async (req, res, next) => {
  try {
    const d = await svc.getDraft(Number(req.params.id))
    if (!d) return res.status(404).json({ error: 'not_found' })
    res.json(d)
  } catch (e) { next(e) }
})

// Создание из n8n (бот → сервисный токен)
r.post('/', async (req, res, next) => {
  try { res.status(201).json(await svc.createDraft(createDraftInput.parse(req.body))) } catch (e) { next(e) }
})

// Согласование диспетчером: тело — payload создания заявки (object_id + items + …)
r.post('/:id/promote', async (req, res, next) => {
  try {
    res.status(201).json(await svc.promote(Number(req.params.id), createOrderInput.parse(req.body)))
  } catch (e) { next(e) }
})

r.post('/:id/reject', async (req, res, next) => {
  try { res.json(await svc.reject(Number(req.params.id), rejectDraftInput.parse(req.body))) } catch (e) { next(e) }
})

export default r
