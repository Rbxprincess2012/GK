import { db } from '../db.js'
import { geocodeObject } from './geocoding.js'

// SQL-агрегат доверенных лиц объекта (с уровнем: участок или весь объект).
export const trustedPersonsAgg = (alias = 'o') => db.raw(`COALESCE((
  SELECT json_agg(json_build_object(
    'id', tp.id, 'name', tp.name, 'phone', tp.phone, 'messengers', tp.messengers,
    'section_id', otp.section_id, 'section_name', sec.name
  ) ORDER BY sec.name NULLS FIRST, tp.name)
  FROM object_trusted_persons otp
  JOIN trusted_persons tp ON tp.id = otp.trusted_person_id
  LEFT JOIN sections sec ON sec.id = otp.section_id
  WHERE otp.object_id = ${alias}.id
), '[]') AS trusted_persons`)

// SQL-агрегат участков объекта.
export const sectionsAgg = (alias = 'o') => db.raw(`COALESCE((
  SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'note', s.note) ORDER BY s.name)
  FROM sections s WHERE s.object_id = ${alias}.id
), '[]') AS sections`)

async function syncTrustedLinks(trx, objectId, links) {
  await trx('object_trusted_persons').where({ object_id: objectId }).del()
  if (!links?.length) return
  // Защита от FK-падений: оставляем только привязки на существующие участки этого объекта
  // (или весь объект) и на лица, реально доступные клиенту (его лица или лица его ГК).
  const obj = await trx('objects').where({ id: objectId }).first()
  const sectionIds = new Set(await trx('sections').where({ object_id: objectId }).pluck('id'))
  const client = obj ? await trx('clients').where({ id: obj.client_id }).first() : null
  const poolIds = new Set(await trx('trusted_persons')
    .where((b) => client?.group_id
      ? b.where({ group_id: client.group_id }).orWhere({ client_id: obj.client_id })
      : b.where({ client_id: obj?.client_id }))
    .pluck('id'))
  const clean = links.filter((l) =>
    poolIds.has(l.trusted_person_id) && (l.section_id == null || sectionIds.has(l.section_id)))
  if (clean.length) {
    await trx('object_trusted_persons').insert(clean.map((l) => ({
      object_id: objectId, trusted_person_id: l.trusted_person_id, section_id: l.section_id ?? null,
    })))
  }
}

// При создании объекта: если задана улица — район из неё. Привязка доверенных лиц.
export async function createObject(data) {
  const { trusted_links, ...payload } = data
  if (payload.street_id && !payload.district_id) {
    const street = await db('streets').where({ id: payload.street_id }).first()
    if (street) payload.district_id = street.district_id
  }
  // Координаты заданы вручную → они приоритетнее авто-геокодинга.
  const manual = payload.lat != null && payload.lng != null
  if (manual) { payload.geo_source = 'manual'; payload.geocoded_at = db.fn.now() }
  const row = await db.transaction(async (trx) => {
    const [r] = await trx('objects').insert(payload).returning('*')
    if (trusted_links) await syncTrustedLinks(trx, r.id, trusted_links)
    return r
  })
  if (!manual) geocodeObject(row.id).catch(() => {}) // авто, best-effort
  return row
}

// Обновление объекта: скалярные поля + (опц.) полная замена привязок доверенных лиц.
export async function updateObject(id, data) {
  const { trusted_links, ...patch } = data
  const manual = patch.lat != null && patch.lng != null
  if (manual) { patch.geo_source = 'manual'; patch.geocoded_at = db.fn.now() }
  const row = await db.transaction(async (trx) => {
    let r = await trx('objects').where({ id }).first()
    if (!r) return null
    if (Object.keys(patch).length) {
      [r] = await trx('objects').where({ id }).update(patch).returning('*')
    }
    if (trusted_links !== undefined) await syncTrustedLinks(trx, id, trusted_links)
    return r
  })
  // Сменили адрес без ручных координат → перегеокодировать (geocodeObject не трогает manual).
  const addressTouched = ['street_id', 'house', 'building', 'district_id'].some((k) => k in patch)
  if (row && !manual && addressTouched) geocodeObject(id, { force: true }).catch(() => {})
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
