import { Router } from 'express'
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

r.delete('/:id', async (req, res, next) => {
  try { await svc.remove(Number(req.params.id)); res.status(204).end() } catch (e) { next(e) }
})

export default r
