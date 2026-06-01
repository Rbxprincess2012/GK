import { Router } from 'express'
import { db } from '../db.js'
import { makeCrud } from '../services/crud.js'
import { createObject, inventory } from '../services/objects.js'
import { objectCreate, objectUpdate } from '../validators/object.js'

const svc = makeCrud('objects')
const r = Router()

r.get('/', async (req, res, next) => {
  try {
    let q = db('objects as o')
      .leftJoin('clients as c', 'c.id', 'o.client_id')
      .leftJoin('streets as s', 's.id', 'o.street_id')
      .leftJoin('districts as d', 'd.id', 'o.district_id')
      .select(
        'o.*', 's.name as street_name', 'd.name as district', 'd.alias as district_alias',
        'c.legal_name as client_legal_name', 'c.nickname as client_nickname',
      )
      .orderBy('o.id')
    for (const f of ['client_id', 'district_id']) {
      if (req.query[f] !== undefined) q = q.where(`o.${f}`, req.query[f])
    }
    res.json(await q)
  } catch (e) { next(e) }
})

r.get('/:id/inventory', async (req, res, next) => {
  try { res.json(await inventory(Number(req.params.id))) } catch (e) { next(e) }
})

r.get('/:id', async (req, res, next) => {
  try {
    const row = await svc.get(Number(req.params.id))
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try { res.status(201).json(await createObject(objectCreate.parse(req.body))) } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try {
    const row = await svc.update(Number(req.params.id), objectUpdate.parse(req.body))
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await svc.remove(Number(req.params.id)); res.status(204).end() } catch (e) { next(e) }
})

export default r
