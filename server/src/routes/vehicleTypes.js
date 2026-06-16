import { Router } from 'express'
import { db } from '../db.js'
import { createVehicleType, updateVehicleType } from '../validators/vehicleType.js'

const r = Router()

// Простая транслитерация RU→lat для slug (стабильный ключ join'а, не показывается пользователю).
const MAP = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
function slugify(name) {
  const base = String(name || '').toLowerCase().split('').map((c) => (MAP[c] ?? c)).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return base || `type_${Date.now().toString(36)}`
}
async function uniqueSlug(name) {
  const root = slugify(name)
  let slug = root
  for (let i = 2; await db('vehicle_types').where({ slug }).first(); i++) slug = `${root}_${i}`
  return slug
}

r.get('/', async (req, res, next) => {
  try {
    let q = db('vehicle_types').orderBy(['sort', 'id'])
    if (req.query.active === '1') q = q.where({ archived: false })
    res.json(await q)
  } catch (e) { next(e) }
})

r.post('/', async (req, res, next) => {
  try {
    const data = createVehicleType.parse(req.body)
    const slug = data.slug || await uniqueSlug(data.name)
    const [row] = await db('vehicle_types').insert({ ...data, slug }).returning('*')
    res.status(201).json(row)
  } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try {
    const data = updateVehicleType.parse(req.body)
    const [row] = await db('vehicle_types').where({ id: Number(req.params.id) }).update(data).returning('*')
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Удаление мягкое: помечаем archived (slug мог использоваться в заявках/машинах).
r.delete('/:id', async (req, res, next) => {
  try {
    await db('vehicle_types').where({ id: Number(req.params.id) }).update({ archived: true })
    res.status(204).end()
  } catch (e) { next(e) }
})

export default r
