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
      'o.id', 'o.number', 'ob.lat', 'ob.lng', 'o.service_type', 'o.grapple_runs',
      'd.name as district', 's.name as street_name', 'ob.house', 'ob.building', 'ob.address_raw', 'ob.city',
      'ob.informal_name as object_name', 'c.legal_name as client_legal_name',
      db.raw(`COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.action IN ('place','replace')), 0)::int AS empties`),
      db.raw(`COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.action IN ('replace','haul')), 0)::int AS fulls`),
      db.raw(`COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id), 0)::int AS item_count`),
      // Различные размеры контейнеров заявки (для сегрегации по размеру при распределении).
      db.raw(`COALESCE((SELECT array_agg(DISTINCT oi.container_type_id) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.container_type_id IS NOT NULL), '{}') AS sizes`),
    )
    .orderBy('o.id')
  return rows.map((r) => ({
    ...r,
    empties: Number(r.empties) || 0, fulls: Number(r.fulls) || 0,
    sizes: Array.isArray(r.sizes) ? r.sizes.map(Number) : [],
    lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng),
  }))
}

// Подсказка распределения: считает раскладку, ничего не сохраняет.
export async function suggestDistribution(date, shiftType) {
  const base = await getSetting('base').catch(() => null)
  const dist = await getSetting('distribution').catch(() => null)
  const kmWeight = dist?.km_weight ?? 0.1
  // Сила локализации: насколько кучность (близость заявок по координатам) важнее дневного баланса
  // (баланс добирается накопленными баллами за период). 0 — прежнее поведение (только баланс за день).
  const localityWeight = dist?.locality_weight ?? 1.5
  // Порог км, в пределах которого заявки считаются «в одной зоне» (кучность по координатам, не по району).
  const clusterKm = dist?.cluster_km ?? 2
  const baseSet = base?.lat != null && base?.lng != null

  const drivers = (await availableDrivers(date, shiftType)).map((d) => ({
    id: d.id, name: d.name, capacity: d.capacity_slots || 3,
    empty_capacity: d.empty_capacity || 2, vehicle_id: d.vehicle_id,
    kind: d.vehicle_kind || 'container', // тип машины (slug): контейнеровоз/грейфер/газель/самосвал
    sizes: Array.isArray(d.vehicle_sizes) ? d.vehicle_sizes.map(Number) : [], // возимые размеры контейнеров
  }))
  const rawOrders = await newOrdersForDate(date)

  // km до базы; заезды считает алгоритм по пустым/полным и вместимости машины водителя.
  // Грейфер-заявка несёт service='grapple' и intrinsic trips = число ходок (контейнерных нет).
  const orders = rawOrders.map((o) => {
    const isBulk = o.service_type && o.service_type !== 'container'
    return {
      id: o.id,
      lat: o.lat ?? null, lng: o.lng ?? null, // для кучности по координатам (распределение)
      service: o.service_type || 'container', // slug типа машины (сегрегация по типу)
      sizes: isBulk ? [] : o.sizes,           // размеры контейнеров (сегрегация по размеру)
      empties: isBulk ? null : o.empties, fulls: isBulk ? null : o.fulls,
      trips: isBulk ? Math.max(1, Number(o.grapple_runs) || 1) : null,
      km: baseSet && o.lat != null && o.lng != null
        ? Math.round(haversineKm({ lat: o.lat, lng: o.lng }, { lat: Number(base.lat), lng: Number(base.lng) }) * 100) / 100
        : null,
    }
  })
  const noGeoCount = orders.filter((o) => o.km == null).length

  // Накопленный балл за окно [date-7 .. date-1] (7 дней по вчерашний включительно; сегодняшний
  // день НЕ входит → нет двойного учёта). Стартовая «фора»: кто возил меньше, начинает с меньшего
  // балла → алгоритм даёт ему больше сегодня (баланс за период).
  const prev = await driverLoadHistory(minusDays(date, 1), 7)
  const priorScores = {}
  for (const h of prev.drivers) priorScores[h.driver_id] = h.score_per_shift

  const result = suggest({ orders, drivers, kmWeight, locality: Math.max(localityWeight, 1), priorScores, localityWeight, clusterKm })

  // Обогащаем раскладку отображаемыми данными заявок.
  const metaById = new Map(rawOrders.map((o) => [o.id, o]))
  const kmById = new Map(orders.map((o) => [o.id, o.km]))
  const orderView = (id, emptyCap) => {
    const m = metaById.get(id)
    const isBulk = m.service_type && m.service_type !== 'container'
    return {
      id, number: m.number, city: m.city, street_name: m.street_name,
      house: m.house, building: m.building, address_raw: m.address_raw,
      object_name: m.object_name, client_legal_name: m.client_legal_name,
      km: kmById.get(id), service_type: m.service_type || 'container',
      empties: isBulk ? 0 : m.empties, fulls: isBulk ? 0 : m.fulls,
      grapple_runs: isBulk ? Math.max(1, Number(m.grapple_runs) || 1) : null,
      trips: isBulk ? Math.max(1, Number(m.grapple_runs) || 1) : tripsFromCounts(m.empties, m.fulls, emptyCap),
    }
  }
  const assignments = result.assignments.map((a) => ({
    ...a,
    orders: a.order_ids.map((id) => orderView(id, a.empty_capacity)),
  }))

  // Нераспределённые: нет машины нужного типа на смене (напр. грейфер-заявка без водителя-грейфера).
  const unassigned = (result.unassigned || []).map((id) => {
    const v = orderView(id, 2)
    // Нет совместимой машины: либо нужного типа (грейфер/газель/самосвал), либо нужного размера.
    return { ...v, reason: 'no_compatible_vehicle' }
  })

  return {
    date, shift_type: shiftType, base_set: baseSet, km_weight: kmWeight, locality_weight: localityWeight,
    no_geo_count: noGeoCount, total_orders: orders.length, drivers_count: drivers.length,
    spread: result.spread, assignments, unassigned,
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
    .select('o.id', 'o.number', 'o.status', 'o.assigned_driver_id', 'o.distance_km', 'o.service_type',
      'ob.lat', 'ob.lng', 'd.name as district', 's.name as street_name', 'ob.house', 'ob.building', 'ob.address_raw', 'ob.city',
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

// Дата за N дней назад от строки YYYY-MM-DD (UTC-арифметика, формат сохраняем).
function minusDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// Накопленная нагрузка водителей за скользящее окно (по умолчанию 7 дней, включая дату).
// Считается ПО НАЗНАЧЕННЫМ заявкам (план), окно [date-(days-1) .. date]. Нормировка —
// на «отработанную смену» = число различных дней окна, когда водителю назначали заявки
// (выходные по графику 3/3 не занижают балл). score_per_shift = сумма баллов / число таких дней.
// Read-only: алгоритм не трогает; менеджер видит, кого можно дозагрузить, а кому дать меньше.
export async function driverLoadHistory(date, days = 7) {
  const from = minusDays(date, days - 1)
  const agg = db('orders')
    .select('assigned_driver_id')
    .count('* as orders')
    .sum({ trips: 'trips' })
    .sum({ km: 'distance_km' })
    .sum({ score: 'load_score' })
    .countDistinct({ shift_days: 'shift_date' })
    .whereBetween('shift_date', [from, date])
    .whereNotIn('status', ['cancelled', 'new'])
    .whereNotNull('assigned_driver_id')
    .groupBy('assigned_driver_id')
    .as('a')

  const rows = await db('drivers as dr')
    .where('dr.is_active', true)
    .leftJoin(agg, 'a.assigned_driver_id', 'dr.id')
    .select('dr.id as driver_id', 'dr.name',
      db.raw('COALESCE(a.orders, 0)::int as orders'),
      db.raw('COALESCE(a.trips, 0)::int as trips'),
      db.raw('ROUND(COALESCE(a.km, 0)::numeric, 2) as km'),
      db.raw('ROUND(COALESCE(a.score, 0)::numeric, 3) as score'),
      db.raw('COALESCE(a.shift_days, 0)::int as shift_days'))
    .orderBy('dr.name')

  const drivers = rows.map((r) => {
    const score = Number(r.score), shiftDays = Number(r.shift_days)
    return {
      driver_id: r.driver_id, name: r.name, orders: r.orders, trips: r.trips,
      km: Number(r.km), score, shift_days: shiftDays,
      score_per_shift: shiftDays > 0 ? Math.round((score / shiftDays) * 1000) / 1000 : 0,
    }
  })
  // Среднее по тем, кто работал (для подсветки «недогружен/перегружен» на фронте).
  const worked = drivers.filter((d) => d.shift_days > 0)
  const avgPerShift = worked.length
    ? Math.round((worked.reduce((s, d) => s + d.score_per_shift, 0) / worked.length) * 1000) / 1000
    : 0
  return { from, to: date, days, avg_per_shift: avgPerShift, drivers }
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
