import { Router } from 'express'
import { db } from '../db.js'

const r = Router()

r.get('/districts', async (_req, res, next) => {
  try { res.json(await db('districts').orderBy('name')) } catch (e) { next(e) }
})

// PATCH /districts/:id — обновить неофициальное название (alias)
r.patch('/districts/:id', async (req, res, next) => {
  try {
    const alias = req.body?.alias?.trim() || null
    const [row] = await db('districts').where({ id: req.params.id }).update({ alias }).returning('*')
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

// GET /streets?q=Красн — поиск улицы, отдаёт с названием района
r.get('/streets', async (req, res, next) => {
  try {
    let q = db('streets as s')
      .join('districts as d', 'd.id', 's.district_id')
      .select('s.id', 's.name', 's.district_id', 'd.name as district', 'd.alias as district_alias')
      .orderBy('s.name')
      .limit(50)
    if (req.query.q) q = q.whereILike('s.name', `%${req.query.q}%`)
    res.json(await q)
  } catch (e) { next(e) }
})

export default r
