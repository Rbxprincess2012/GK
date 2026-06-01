import { Router } from 'express'
import * as svc from '../services/orders.js'
import { createOrderInput, assignInput, completeInput, driverConfirmInput, failInput } from '../validators/order.js'
import { attachmentInput } from '../validators/attachment.js'

const r = Router()

r.get('/', async (req, res, next) => {
  try { res.json(await svc.listOrders(req.query)) } catch (e) { next(e) }
})

r.get('/:id', async (req, res, next) => {
  try {
    const o = await svc.getOrder(Number(req.params.id))
    if (!o) return res.status(404).json({ error: 'not_found' })
    res.json(o)
  } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try { res.status(201).json(await svc.createOrder(createOrderInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/assign', async (req, res, next) => {
  try { res.json(await svc.assign(Number(req.params.id), assignInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/complete', async (req, res, next) => {
  try { res.json(await svc.complete(Number(req.params.id), completeInput.parse(req.body))) } catch (e) { next(e) }
})

// Этап 2: принять черновик клиента (pending_review → new, присвоить номер)
r.post('/:id/accept', async (req, res, next) => {
  try { res.json(await svc.accept(Number(req.params.id))) } catch (e) { next(e) }
})

// Этап 2: водитель подтвердил выполнение (→ done + пруф, без движений)
r.post('/:id/driver-confirm', async (req, res, next) => {
  try { res.json(await svc.driverConfirm(Number(req.params.id), driverConfirmInput.parse(req.body))) } catch (e) { next(e) }
})

// Этап 2: водитель не выполнил (→ failed + причина)
r.post('/:id/fail', async (req, res, next) => {
  try { res.json(await svc.fail(Number(req.params.id), failInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/close', async (req, res, next) => {
  try { res.json(await svc.close(Number(req.params.id))) } catch (e) { next(e) }
})

r.post('/:id/attachments', async (req, res, next) => {
  try {
    res.status(201).json(await svc.addAttachment(Number(req.params.id), attachmentInput.parse(req.body)))
  } catch (e) { next(e) }
})

export default r
