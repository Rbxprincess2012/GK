import { Router } from 'express'
import { z } from 'zod'
import { suggestDistribution, applyDistribution, loadReport, mapData } from '../services/distribution.js'

const r = Router()

const suggestInput = z.object({
  date: z.string().min(8),
  shift_type: z.enum(['day', 'night']).default('day'),
}).strict()

const applyInput = z.object({
  date: z.string().min(8),
  shift_type: z.enum(['day', 'night']).default('day'),
  assignments: z.array(z.object({
    driver_id: z.number().int(),
    order_ids: z.array(z.number().int()),
  })),
}).strict()

// Подсказка раскладки (ничего не сохраняет).
r.post('/suggest', async (req, res, next) => {
  try {
    const { date, shift_type } = suggestInput.parse(req.body)
    res.json(await suggestDistribution(date, shift_type))
  } catch (e) { next(e) }
})

// Применить раскладку (назначить заявки).
r.post('/apply', async (req, res, next) => {
  try {
    const { date, shift_type, assignments } = applyInput.parse(req.body)
    res.json(await applyDistribution(date, shift_type, assignments))
  } catch (e) { next(e) }
})

// Данные для карты смены.
r.get('/map', async (req, res, next) => {
  try {
    const { date, shift_type = 'day' } = req.query
    if (!date) return res.status(400).json({ error: 'date required' })
    res.json(await mapData(date, shift_type))
  } catch (e) { next(e) }
})

// Отчёт фактической нагрузки за период.
r.get('/load', async (req, res, next) => {
  try {
    const { from, to } = req.query
    if (!from || !to) return res.status(400).json({ error: 'from/to required' })
    res.json(await loadReport(from, to))
  } catch (e) { next(e) }
})

export default r
