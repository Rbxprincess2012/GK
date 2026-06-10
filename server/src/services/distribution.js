import { db } from '../db.js'
import { availableDrivers } from './shifts.js'
import { getSetting } from './settings.js'
import { assign } from './orders.js'
import { haversineKm, tripsFromCounts, suggest } from '../lib/distribute.js'

// Нераспределённые заявки выбранного дня с координатами объекта и числом заездов.
// Заезды — по правилам машины: E (пустых)=Поставить+Заменить, F (полных)=Заменить+Забрать.
async function newOrdersForDate(date) {
  const rows = await db('orders as o')
    .join('objects as ob', 'ob.id', 'o.object_id')
    .leftJoin('districts as d', 'd.id', 'ob.district_id')
    .leftJoin('streets as s', 's.id', 'ob.street_id')
    .leftJoin('clients as c', 'c.id', 'o.client_id')
    .where({ 'o.status': 'new', 'o.desired_date': date })
    .select(
      'o.id', 'o.number', 'ob.lat', 'ob.lng',
      'd.name as district', 's.name as street_name', 'ob.house', 'ob.informal_name as object_name',
      'c.legal_name as client_legal_name',
      db.raw(`COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.action IN ('place','replace')), 0)::int AS empties`),
      db.raw(`COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.action IN ('replace','haul')), 0)::int AS fulls`),
      db.raw(`COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id), 0)::int AS item_count`),
    )
    .orderBy('o.id')
  return rows.map((r) => ({
    ...r,
    empties: Number(r.empties) || 0, fulls: Number(r.fulls) || 0,
    lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng),
  }))
}

// Подсказка распределения: считает раскладку, ничего не сохраняет.
export async function suggestDistribution(date, shiftType) {
  const base = await getSetting('base').catch(() => null)
  const dist = await getSetting('distribution').catch(() => null)
  const kmWeight = dist?.km_weight ?? 0.1
  const baseSet = base?.lat != null && base?.lng != null

  const drivers = (await availableDrivers(date, shiftType)).map((d) => ({
    id: d.id, name: d.name, capacity: d.capacity_slots || 3,
    empty_capacity: d.empty_capacity || 2, vehicle_id: d.vehicle_id,
  }))
  const rawOrders = await newOrdersForDate(date)

  // km до базы; заезды считает алгоритм по пустым/полным и вместимости машины водителя.
  const orders = rawOrders.map((o) => ({
    id: o.id, district: o.district || null, empties: o.empties, fulls: o.fulls,
    km: baseSet && o.lat != null && o.lng != null
      ? Math.round(haversineKm({ lat: o.lat, lng: o.lng }, { lat: Number(base.lat), lng: Number(base.lng) }) * 100) / 100
      : null,
  }))
  const noGeoCount = orders.filter((o) => o.km == null).length

  const result = suggest({ orders, drivers, kmWeight })

  // Обогащаем раскладку отображаемыми данными заявок.
  const metaById = new Map(rawOrders.map((o) => [o.id, o]))
  const kmById = new Map(orders.map((o) => [o.id, o.km]))
  const assignments = result.assignments.map((a) => ({
    ...a,
    orders: a.order_ids.map((id) => {
      const m = metaById.get(id)
      return {
        id, number: m.number, district: m.district, street_name: m.street_name,
        house: m.house, object_name: m.object_name, client_legal_name: m.client_legal_name,
        km: kmById.get(id), empties: m.empties, fulls: m.fulls,
        trips: tripsFromCounts(m.empties, m.fulls, a.empty_capacity),
      }
    }),
  }))

  return {
    date, shift_type: shiftType, base_set: baseSet, km_weight: kmWeight,
    no_geo_count: noGeoCount, total_orders: orders.length, drivers_count: drivers.length,
    spread: result.spread, assignments,
  }
}

// Данные для карты смены: заявки дня (нераспределённые + назначенные на смену) с координатами.
export async function mapData(date, shiftType) {
  const base = await getSetting('base').catch(() => null)
  const orders = await db('orders as o')
    .join('objects as ob', 'ob.id', 'o.object_id')
    .leftJoin('districts as d', 'd.id', 'ob.district_id')
    .leftJoin('streets as s', 's.id', 'ob.street_id')
    .leftJoin('clients as c', 'c.id', 'o.client_id')
    .leftJoin('drivers as dr', 'dr.id', 'o.assigned_driver_id')
    .where((b) => {
      b.where((x) => x.where('o.status', 'new').andWhere('o.desired_date', date))
        .orWhere((x) => x.where('o.shift_date', date).andWhere('o.shift_type', shiftType)
          .whereIn('o.status', ['assigned', 'review', 'in_progress']))
    })
    .select('o.id', 'o.number', 'o.status', 'o.assigned_driver_id', 'o.distance_km',
      'ob.lat', 'ob.lng', 'd.name as district', 's.name as street_name', 'ob.house',
      'ob.informal_name as object_name', 'c.legal_name as client_legal_name', 'dr.name as driver_name')
    .orderBy('o.id')

  const mapped = orders.map((o) => ({
    ...o,
    lat: o.lat == null ? null : Number(o.lat),
    lng: o.lng == null ? null : Number(o.lng),
    distance_km: o.distance_km == null ? null : Number(o.distance_km),
  }))
  return {
    base: base?.lat != null ? { lat: Number(base.lat), lng: Number(base.lng), address: base.address } : null,
    orders: mapped,
    no_geo_count: mapped.filter((o) => o.lat == null).length,
  }
}

// Отчёт фактической нагрузки по водителям за период (по сохранённым метрикам заказов).
export async function loadReport(from, to) {
  const rows = await db('orders as o')
    .join('drivers as dr', 'dr.id', 'o.assigned_driver_id')
    .whereBetween('o.shift_date', [from, to])
    .whereNotIn('o.status', ['cancelled', 'new'])
    .groupBy('dr.id', 'dr.name')
    .select('dr.id as driver_id', 'dr.name',
      db.raw('COUNT(*)::int as orders'),
      db.raw('COALESCE(SUM(o.trips), 0)::int as trips'),
      db.raw('ROUND(COALESCE(SUM(o.distance_km), 0)::numeric, 2) as km'),
      db.raw('ROUND(COALESCE(SUM(o.load_score), 0)::numeric, 3) as score'))
    .orderBy('dr.name')
  return rows.map((r) => ({ ...r, km: Number(r.km), score: Number(r.score) }))
}

// Применить раскладку: назначить заявки водителям (метрики пишутся в assign()).
export async function applyDistribution(date, shiftType, assignments) {
  let assigned = 0
  const failed = []
  for (const a of assignments) {
    for (const orderId of a.order_ids || []) {
      try {
        await assign(orderId, { driver_id: a.driver_id, shift_date: date, shift_type: shiftType })
        assigned++
      } catch (e) {
        failed.push({ order_id: orderId, error: e.message })
      }
    }
  }
  return { assigned, failed }
}
