import { Router } from 'express'
import { listVehicles, getVehicle, createVehicle, updateVehicleSvc, removeVehicle } from '../services/vehicles.js'
import { createVehicle as createSchema, updateVehicle as updateSchema } from '../validators/vehicle.js'

// Машины: как crudRouter, но с типом (slug) и набором возимых размеров (vehicle_container_types).
const r = Router()

r.get('/', async (req, res, next) => {
  try { res.json(await listVehicles()) } catch (e) { next(e) }
})

r.get('/:id', async (req, res, next) => {
  try {
    const v = await getVehicle(Number(req.params.id))
    if (!v) return res.status(404).json({ error: 'not_found' })
    res.json(v)
  } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try { res.status(201).json(await createVehicle(createSchema.parse(req.body))) }
  catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try {
    const v = await updateVehicleSvc(Number(req.params.id), updateSchema.parse(req.body))
    if (!v) return res.status(404).json({ error: 'not_found' })
    res.json(v)
  } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await removeVehicle(Number(req.params.id)); res.status(204).end() }
  catch (e) { next(e) }
})

export default r
