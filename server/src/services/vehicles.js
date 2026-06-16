import { db } from '../db.js'

// Размеры (типы контейнеров) машины — из junction vehicle_container_types + каталог container_types.
async function sizesFor(vehicleId, conn = db) {
  return conn('vehicle_container_types as vct')
    .join('container_types as ct', 'ct.id', 'vct.container_type_id')
    .where('vct.vehicle_id', vehicleId)
    .select('ct.id as container_type_id', 'ct.name', 'ct.volume', 'vct.is_default')
    .orderBy('ct.volume')
}

// Список машин + название типа (по slug) + возимые размеры. Тип машины хранится в vehicles.kind (slug).
export async function listVehicles(conn = db) {
  const rows = await conn('vehicles as v')
    .leftJoin('vehicle_types as vt', 'vt.slug', 'v.kind')
    .select('v.*', 'vt.name as kind_name', 'vt.carries_containers')
    .orderBy('v.gov_number')
  for (const v of rows) v.sizes = v.carries_containers === false ? [] : await sizesFor(v.id, conn)
  return rows
}

export async function getVehicle(id, conn = db) {
  const v = await conn('vehicles as v')
    .leftJoin('vehicle_types as vt', 'vt.slug', 'v.kind')
    .where('v.id', id).select('v.*', 'vt.name as kind_name', 'vt.carries_containers').first()
  if (!v) return null
  v.sizes = await sizesFor(id, conn)
  return v
}

// Записать размеры машины (заменяет набор целиком). sizes: [{ container_type_id, is_default? }].
async function writeSizes(vehicleId, sizes, conn) {
  await conn('vehicle_container_types').where({ vehicle_id: vehicleId }).del()
  if (!sizes?.length) return
  // Ровно один основной: первый помеченный is_default, иначе первый в списке.
  const defIdx = Math.max(0, sizes.findIndex((s) => s.is_default))
  await conn('vehicle_container_types').insert(sizes.map((s, i) => ({
    vehicle_id: vehicleId, container_type_id: s.container_type_id, is_default: i === defIdx,
  })))
}

export async function createVehicle(payload) {
  return db.transaction(async (trx) => {
    const { sizes, ...fields } = payload
    const [v] = await trx('vehicles').insert(fields).returning('*')
    if (sizes !== undefined) await writeSizes(v.id, sizes, trx)
    return getVehicle(v.id, trx)
  })
}

export async function updateVehicleSvc(id, payload) {
  return db.transaction(async (trx) => {
    const { sizes, ...fields } = payload
    if (Object.keys(fields).length) await trx('vehicles').where({ id }).update(fields)
    if (sizes !== undefined) await writeSizes(id, sizes, trx)
    return getVehicle(id, trx)
  })
}

export async function removeVehicle(id) {
  await db('vehicles').where({ id }).del() // vehicle_container_types — onDelete CASCADE
  return { ok: true }
}
