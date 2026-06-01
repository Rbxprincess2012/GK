import { db } from '../db.js'

// При создании объекта: если задана улица, район берём из неё.
export async function createObject(data) {
  const payload = { ...data }
  if (payload.street_id && !payload.district_id) {
    const street = await db('streets').where({ id: payload.street_id }).first()
    if (street) payload.district_id = street.district_id
  }
  const [row] = await db('objects').insert(payload).returning('*')
  return row
}

// Текущий инвентарь объекта = контейнеры, стоящие на нём.
export function inventory(objectId) {
  return db('containers as c')
    .join('container_types as t', 't.id', 'c.type_id')
    .where({ 'c.object_id': objectId, 'c.location': 'object' })
    .select('c.id', 'c.number', 'c.state', 'c.type_id', 't.name as type_name')
    .orderBy('c.number')
}
