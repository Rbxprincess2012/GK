import { Router } from 'express'
import { db } from '../db.js'
import { createTrustedPerson, updateTrustedPerson } from '../validators/trustedPerson.js'

const r = Router()

// Пул доверенных лиц, доступных клиенту:
//  — клиент в группе  → все лица его ГК (общий пул на всю группу);
//  — клиент одиночный → его собственные лица.
async function poolForClient(clientId) {
  const client = await db('clients').where({ id: clientId }).first()
  if (!client) return []
  // в группе — все лица ГК (+ личные лица самого клиента, если остались с до-групповых времён);
  // вне группы — только личные лица клиента.
  const q = db('trusted_persons')
  if (client.group_id) q.where((b) => b.where({ group_id: client.group_id }).orWhere({ client_id: client.id }))
  else q.where({ client_id: client.id })
  return q.orderBy('name')
}

r.get('/', async (req, res, next) => {
  try {
    if (req.query.for_client !== undefined) {
      return res.json(await poolForClient(Number(req.query.for_client)))
    }
    let q = db('trusted_persons')
    if (req.query.client_id !== undefined) q = q.where({ client_id: req.query.client_id })
    if (req.query.group_id !== undefined) q = q.where({ group_id: req.query.group_id })
    res.json(await q.orderBy('name'))
  } catch (e) { next(e) }
})

r.get('/:id', async (req, res, next) => {
  try {
    const row = await db('trusted_persons').where({ id: Number(req.params.id) }).first()
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Нормализуем scope: если переданный клиент состоит в группе — лицо привязываем к группе.
async function resolveScope({ client_id, group_id }) {
  if (group_id) return { client_id: null, group_id }
  if (client_id) {
    const client = await db('clients').where({ id: client_id }).first()
    if (client?.group_id) return { client_id: null, group_id: client.group_id }
    return { client_id, group_id: null }
  }
  return { client_id: null, group_id: null }
}

// jsonb-поле chats передаём в БД строкой (knex/pg не сериализует объект в jsonb сам).
function serializeChats(data) {
  if (data.chats && typeof data.chats === 'object') return { ...data, chats: JSON.stringify(data.chats) }
  return data
}

r.post('/', async (req, res, next) => {
  try {
    const data = createTrustedPerson.parse(req.body)
    const { client_id, group_id, ...rest } = data
    const scope = await resolveScope({ client_id, group_id })
    const [row] = await db('trusted_persons').insert(serializeChats({ ...rest, ...scope })).returning('*')
    res.status(201).json(row)
  } catch (e) { next(e) }
})

r.patch('/:id', async (req, res, next) => {
  try {
    const data = updateTrustedPerson.parse(req.body)
    const [row] = await db('trusted_persons').where({ id: Number(req.params.id) }).update(serializeChats(data)).returning('*')
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json(row)
  } catch (e) { next(e) }
})

r.delete('/:id', async (req, res, next) => {
  try { await db('trusted_persons').where({ id: Number(req.params.id) }).del(); res.status(204).end() }
  catch (e) { next(e) }
})

export default r
