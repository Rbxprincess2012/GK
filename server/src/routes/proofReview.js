import { Router } from 'express'
import * as svc from '../services/proofReview.js'
import { rejectInput } from '../validators/proofReview.js'
import { requireRole } from '../middleware/authUser.js'

const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))

const userId = (req) => req.auth?.user?.id || null

// Очередь проверки пруфов (заявки с непросмотренными done-под-задачами).
r.get('/proof-review', async (req, res, next) => {
  try { res.json(await svc.subtasksForReview(req.query)) } catch (e) { next(e) }
})

// Принять пруф под-задачи.
r.post('/subtasks/:id/accept', async (req, res, next) => {
  try { res.json(await svc.acceptSubtask(Number(req.params.id), userId(req))) } catch (e) { next(e) }
})

// Вернуть пруф на переделку (с комментарием).
r.post('/subtasks/:id/reject', async (req, res, next) => {
  try {
    const { comment } = rejectInput.parse(req.body)
    res.json(await svc.rejectSubtask(Number(req.params.id), userId(req), comment))
  } catch (e) { next(e) }
})

export default r
