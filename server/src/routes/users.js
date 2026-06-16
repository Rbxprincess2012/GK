import { Router } from 'express'
import * as svc from '../services/users.js'
import { createUserInput, updateUserInput } from '../validators/user.js'

const r = Router()

const actorRole = (req) => req.auth.user.role
const actorId = (req) => req.auth.user.id

r.get('/', async (req, res, next) => {
  try { res.json(await svc.list(actorRole(req))) } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try { res.status(201).json(await svc.create(createUserInput.parse(req.body), actorRole(req))) } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try { res.json(await svc.update(Number(req.params.id), updateUserInput.parse(req.body), actorRole(req), actorId(req))) } catch (e) { next(e) }
})

r.post('/:id/reset-password', async (req, res, next) => {
  try { res.json({ invite_url: await svc.resetPassword(Number(req.params.id), actorRole(req)) }) } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await svc.remove(Number(req.params.id), actorRole(req), actorId(req)); res.status(204).end() } catch (e) { next(e) }
})

export default r
