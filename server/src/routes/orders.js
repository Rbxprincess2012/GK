import { Router } from 'express'
import * as svc from '../services/orders.js'
import { createOrderInput, updateOrderInput, sendToReviewInput, moveDriverInput, assignInput, completeInput, driverConfirmInput, failInput } from '../validators/order.js'
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

r.post('/send-to-review', async (req, res, next) => {
  try { res.json(await svc.sendToReview(sendToReviewInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/send-to-work', async (req, res, next) => {
  try { res.json(await svc.sendToWork(sendToReviewInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/move-driver', async (req, res, next) => {
  try { res.json(await svc.moveToDriver(Number(req.params.id), moveDriverInput.parse(req.body))) } catch (e) { next(e) }
})

// Порядок исполнения заявок (приоритет внутри водителя).
r.post('/reorder', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids.map(Number).filter(Number.isInteger) : []
    res.json(await svc.reorderOrders(ids))
  } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try { res.json(await svc.updateOrder(Number(req.params.id), updateOrderInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/cancel', async (req, res, next) => {
  try { res.json(await svc.cancelOrder(Number(req.params.id))) } catch (e) { next(e) }
})

r.post('/:id/restore', async (req, res, next) => {
  try { res.json(await svc.restoreOrder(Number(req.params.id))) } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { res.json(await svc.removeOrder(Number(req.params.id))) } catch (e) { next(e) }
})

r.post('/:id/assign', async (req, res, next) => {
  try { res.json(await svc.assign(Number(req.params.id), assignInput.parse(req.body))) } catch (e) { next(e) }
})

r.post('/:id/unassign', async (req, res, next) => {
  try { res.json(await svc.unassign(Number(req.params.id))) } catch (e) { next(e) }
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
