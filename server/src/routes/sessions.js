import { Router } from 'express'
import * as sessions from '../services/sessions.js'

// Heartbeat журнала посещений: фронт раз в ~60 c продлевает активность сессии,
// пока вкладка открыта. id сессии берётся из JWT (claim sid). Под requireUser.
const r = Router()

r.post('/ping', async (req, res, next) => {
  try {
    await sessions.ping(req.auth?.user?.sid)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default r
