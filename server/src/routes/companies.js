import { Router } from 'express'
import { z } from 'zod'
import * as svc from '../services/companies.js'
import { createCompany, updateCompany } from '../validators/company.js'

// Раздел суперпользователя «Клиенты» — компании-клиенты SaaS. Монтируется под
// requireRole('superuser') в routes/index.js.
const r = Router()

r.get('/', async (_req, res, next) => {
  try { res.json(await svc.list()) } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try { res.status(201).json(await svc.create(createCompany.parse(req.body))) } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try { res.json(await svc.update(Number(req.params.id), updateCompany.parse(req.body))) } catch (e) { next(e) }
})

// «Предоставить доступ»: открыть директору саморегистрацию по director_email.
r.post('/:id/grant', async (req, res, next) => {
  try { res.json(await svc.grantAccess(Number(req.params.id))) } catch (e) { next(e) }
})

// Продление подписки на N месяцев (кнопки «Оплачен 1/3/6/12 мес»).
const extendInput = z.object({ months: z.coerce.number().int().positive().max(60) })
r.post('/:id/extend', async (req, res, next) => {
  try {
    const { months } = extendInput.parse(req.body)
    res.json(await svc.extendSubscription(Number(req.params.id), months, req.auth?.user?.id || null))
  } catch (e) { next(e) }
})

// Журнал посещений компании: итог + разбивка по сотрудникам.
r.get('/:id/stats', async (req, res, next) => {
  try { res.json(await svc.statsForCompany(Number(req.params.id))) } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await svc.remove(Number(req.params.id)); res.status(204).end() } catch (e) { next(e) }
})

export default r
