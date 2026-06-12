import { Router } from 'express'
import { db } from '../db.js'
import * as svc from '../services/proofReview.js'
import { carryOverSubtask } from '../services/subtasks.js'
import { assign } from '../services/orders.js'
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

// Перенести невыполненный участок в отдельную новую заявку (приёмка менеджером).
//  - без assign → заявка остаётся в Задачах как «Новая» («Оставить в Задачах»);
//  - с assign {driver_id, shift_date, shift_type, vehicle_id?} → сразу назначается водителю.
r.post('/subtasks/:id/carry-over', async (req, res, next) => {
  try {
    const child = await carryOverSubtask(Number(req.params.id))
    // Менеджер мог задать время заезда новой заявки (дропдаун как в «Заявках в работе»).
    if (req.body?.desired_time !== undefined) {
      await db('orders').where({ id: child.id }).update({ desired_time: req.body.desired_time || null })
    }
    const a = req.body?.assign
    if (a && a.driver_id && a.shift_date) {
      const assigned = await assign(child.id, {
        driver_id: Number(a.driver_id),
        shift_date: a.shift_date,
        shift_type: a.shift_type || 'day',
        vehicle_id: a.vehicle_id != null ? Number(a.vehicle_id) : null,
      })
      return res.json({ ...assigned, desired_time: req.body?.desired_time ?? assigned.desired_time })
    }
    res.json(await db('orders').where({ id: child.id }).first())
  } catch (e) { next(e) }
})

export default r
