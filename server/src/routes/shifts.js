import { Router } from 'express'
import { upsertShift, range, availableDrivers, removeShift } from '../services/shifts.js'
import { upsertShiftInput } from '../validators/shift.js'

const r = Router()

r.get('/available', async (req, res, next) => {
  try { res.json(await availableDrivers(req.query.date, req.query.shift_type)) } catch (e) { next(e) }
})

r.get('/', async (req, res, next) => {
  try { res.json(await range(req.query.from, req.query.to)) } catch (e) { next(e) }
})

r.put('/', async (req, res, next) => {
  try { res.json(await upsertShift(upsertShiftInput.parse(req.body))) } catch (e) { next(e) }
})

// DELETE /shifts?driver_id=&date=&shift_type=  — убрать водителя со смены
r.delete('/', async (req, res, next) => {
  try {
    const { driver_id, date, shift_type } = req.query
    if (!driver_id || !date || !shift_type) return res.status(400).json({ error: 'missing_params' })
    await removeShift({ driver_id: Number(driver_id), date, shift_type })
    res.status(204).end()
  } catch (e) { next(e) }
})

export default r
