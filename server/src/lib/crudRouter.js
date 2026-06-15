import { Router } from 'express'
import { makeCrud } from '../services/crud.js'

// Универсальный CRUD-роутер: GET / (с фильтрами), GET/:id, POST, PATCH/:id, DELETE/:id.
// jsonbFields — колонки jsonb: их значение-объект сериализуем строкой перед записью
// (knex/pg не приводит JS-объект к jsonb сам — иначе уходит "[object Object]" → ошибка вставки).
export function crudRouter(table, { createSchema, updateSchema, allowedFilters = [], jsonbFields = [] }) {
  const svc = makeCrud(table)
  const r = Router()

  const serializeJsonb = (data) => {
    if (!jsonbFields.length || !data || typeof data !== 'object') return data
    const out = { ...data }
    for (const f of jsonbFields) if (out[f] != null && typeof out[f] === 'object') out[f] = JSON.stringify(out[f])
    return out
  }

  r.get('/', async (req, res, next) => {
    try {
      const where = {}
      for (const f of allowedFilters) if (req.query[f] !== undefined) where[f] = req.query[f]
      res.json(await svc.list(where))
    } catch (e) { next(e) }
  })

  r.get('/:id', async (req, res, next) => {
    try {
      const row = await svc.get(Number(req.params.id))
      if (!row) return res.status(404).json({ error: 'not_found' })
      res.json(row)
    } catch (e) { next(e) }
  })

  r.post('/', async (req, res, next) => {
    try {
      const data = createSchema.parse(req.body)
      res.status(201).json(await svc.create(serializeJsonb(data)))
    } catch (e) { next(e) }
  })

  r.patch('/:id', async (req, res, next) => {
    try {
      const data = updateSchema.parse(req.body)
      const row = await svc.update(Number(req.params.id), serializeJsonb(data))
      if (!row) return res.status(404).json({ error: 'not_found' })
      res.json(row)
    } catch (e) { next(e) }
  })

  r.delete('/:id', async (req, res, next) => {
    try { await svc.remove(Number(req.params.id)); res.status(204).end() }
    catch (e) { next(e) }
  })

  return r
}
