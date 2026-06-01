import { Router } from 'express'
import { db } from '../db.js'

const r = Router()

// создать/получить маршрут дня (водитель×дата×смена)
r.post('/', async (req, res, next) => {
  try {
    const { driver_id, date, shift_type, vehicle_id = null } = req.body
    const [route] = await db('routes')
      .insert({ driver_id, date, shift_type, vehicle_id })
      .onConflict(['driver_id', 'date', 'shift_type']).merge().returning('*')
    res.status(201).json(route)
  } catch (e) { next(e) }
})

r.get('/', async (req, res, next) => {
  try {
    const { driver_id, date, shift_type } = req.query
    const route = await db('routes').where({ driver_id, date, shift_type }).first()
    if (!route) return res.json(null)
    const stops = await db('route_stops').where({ route_id: route.id }).orderBy('seq')
    res.json({ ...route, stops })
  } catch (e) { next(e) }
})

// заменить остановки маршрута, нумеруя seq по порядку
r.put('/:id/stops', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const stops = req.body.stops ?? []
    await db.transaction(async (trx) => {
      await trx('route_stops').where({ route_id: id }).del()
      if (stops.length) {
        await trx('route_stops').insert(stops.map((s, i) => ({
          route_id: id, seq: i + 1,
          stop_type: s.stop_type, order_id: s.order_id ?? null, object_id: s.object_id ?? null,
        })))
      }
    })
    res.json(await db('route_stops').where({ route_id: id }).orderBy('seq'))
  } catch (e) { next(e) }
})

export default r
