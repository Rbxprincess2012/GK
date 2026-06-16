import { Router } from 'express'
import { z } from 'zod'
import * as svc from '../services/pricing.js'

// Цены и скидки подписки — только суперпользователь (страница «Цены»).
// Монтируется под requireRole('superuser') в routes/index.js.
const r = Router()

const pricingInput = z.object({
  currency: z.string().optional(),
  base_month: z.number().min(0).optional(),
  trial_days: z.number().int().min(0).max(365).optional(),
  tiers: z.array(z.object({
    months: z.number().int().positive(),
    discount: z.number().min(0).max(100),
  })).max(12).optional(),
}).strict()

r.get('/', async (_req, res, next) => {
  try { res.json(await svc.getPricing()) } catch (e) { next(e) }
})

r.patch('/', async (req, res, next) => {
  try { res.json(await svc.setPricing(pricingInput.parse(req.body))) } catch (e) { next(e) }
})

export default r
