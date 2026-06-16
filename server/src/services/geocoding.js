import { db } from '../db.js'
import { geocode, regionPrefix } from '../lib/geocode.js'
import { getSetting } from './settings.js'
import { haversineKm } from '../lib/distribute.js'

const MAX_KM_FROM_BASE = 200 // дальше — почти наверняка ложный матч в другом городе

// Чистим название улицы: убираем тип («ул.»/«пр.»/…) и «им.»/«имени», лишние пробелы.
// Район (округ) в запрос НЕ кладём — он сбивает геокодер.
function cleanStreet(name) {
  return (name || '')
    .replace(/^(ул\.?|улица|пер\.?|переулок|пр-?кт\.?|просп\.?|проспект|проезд|б-?р\.?|бульвар|ш\.?|шоссе|наб\.?|набережная|туп\.?|тупик|пл\.?|площадь|аллея)\s+/i, '')
    .replace(/\b(им\.?|имени)\s+/gi, '')
    .replace(/\s{2,}/g, ' ').trim()
}

// Структура адреса объекта для геокодера: город (из настройки region) + улица + дом.
function buildParts({ region, street_name, house, building }) {
  return { city: region || undefined, street: cleanStreet(street_name), house: house || undefined, building: building || undefined }
}

async function loadObjectForGeo(id) {
  return db('objects as o')
    .leftJoin('streets as s', 's.id', 'o.street_id')
    .leftJoin('districts as d', 'd.id', 'o.district_id')
    .where('o.id', id)
    .select('o.id', 'o.lat', 'o.lng', 'o.geo_source', 'o.house', 'o.building',
      'o.city', 'o.address_raw', 's.name as street_name', 'd.name as district')
    .first()
}

// Геокодировать один объект. Ручные координаты (geo_source='manual') не трогаем.
// force=true — перегеокодировать даже при наличии координат (кроме manual).
export async function geocodeObject(id, { force = false } = {}) {
  const o = await loadObjectForGeo(id)
  if (!o) return null
  if (o.geo_source === 'manual') return { skipped: 'manual' }
  if (!force && o.lat != null && o.lng != null) return { skipped: 'has_coords' }

  // Объект из справочника (есть улица) → структурированный запрос; иначе свободный
  // адрес (address_raw, любой город РФ из DaData) — целой строкой.
  const query = o.street_name
    ? buildParts({ region: await regionPrefix(), ...o })
    : (o.address_raw || null)
  if (!query) return { skipped: 'no_address' }
  const hit = await geocode(query)
  if (!hit) return { skipped: 'no_result' }

  // Защита от ложного матча в другом городе: точка не должна быть абсурдно далеко от базы.
  const base = await getSetting('base').catch(() => null)
  if (base?.lat != null) {
    const d = haversineKm({ lat: hit.lat, lng: hit.lng }, { lat: Number(base.lat), lng: Number(base.lng) })
    if (d != null && d > MAX_KM_FROM_BASE) return { skipped: 'too_far', km: Math.round(d) }
  }

  await db('objects').where({ id }).update({
    lat: hit.lat, lng: hit.lng, geo_source: hit.source, geocoded_at: db.fn.now(),
  })
  return hit
}

// Ручная установка координат (приоритетнее авто): geo_source='manual'.
export async function setManualCoords(id, lat, lng) {
  const [row] = await db('objects').where({ id })
    .update({ lat, lng, geo_source: 'manual', geocoded_at: db.fn.now() })
    .returning(['id', 'lat', 'lng', 'geo_source'])
  return row
}

// Догеокодировать все объекты без координат (кроме ручных). Последовательно, мягко.
export async function backfillObjects() {
  const rows = await db('objects')
    .whereNull('lat').andWhere((b) => b.whereNot('geo_source', 'manual').orWhereNull('geo_source'))
    .select('id')
  const out = { total: rows.length, ok: 0, skipped: 0 }
  for (const { id } of rows) {
    const r = await geocodeObject(id)
    if (r && r.lat != null) out.ok++; else out.skipped++
    await new Promise((res) => setTimeout(res, 1100)) // Nominatim: не более ~1 запроса/с
  }
  return out
}
