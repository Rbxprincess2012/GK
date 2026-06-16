import { db } from '../db.js'
import { getSetting } from './settings.js'
import { haversineKm, tripsForItems } from '../lib/distribute.js'

// Вместимость пустых контейнеров у машины (сколько увозит на объект за рейс). По умолч. 2.
export async function emptyCapForVehicle(vehicleId, conn = db) {
  if (!vehicleId) return 2
  const v = await conn('vehicles').where({ id: vehicleId }).first()
  return v?.empty_capacity || 2
}

// Заезды заявки по правилам машины: ≤emptyCap пустых туда / 1 полный обратно.
export async function tripsForOrder(orderId, emptyCap = 2, conn = db) {
  const items = await conn('order_items').where({ order_id: orderId }).select('action', 'quantity')
  return tripsForItems(items, emptyCap)
}

// Метрики нагрузки заявки: условный км до базы, заезды, балл тяжести.
// Сохраняются на заказе при назначении — для сравнения фактической нагрузки за период.
// Заезды считаются по вместимости пустых назначенной машины (vehicleId).
export async function metricsForOrder(orderId, { vehicleId = null, conn = db } = {}) {
  const o = await conn('objects as ob')
    .join('orders as o', 'o.object_id', 'ob.id')
    .where('o.id', orderId)
    .select('ob.lat', 'ob.lng', 'o.service_type', 'o.grapple_runs')
    .first()
  const base = await getSetting('base').catch(() => null)
  const dist = await getSetting('distribution').catch(() => null)
  const kmWeight = dist?.km_weight ?? 0.1

  const hasCoords = o?.lat != null && o?.lng != null && base?.lat != null && base?.lng != null
  const km = hasCoords ? haversineKm({ lat: Number(o.lat), lng: Number(o.lng) }, { lat: Number(base.lat), lng: Number(base.lng) }) : null
  // Навальный вывоз (грейфер/газель/самосвал, т.е. любой тип ≠ 'container'): заезды = число ходок
  // (контейнерная физика неприменима). Контейнеровоз — по позициям/вместимости пустых.
  const emptyCap = await emptyCapForVehicle(vehicleId, conn)
  const isBulk = o?.service_type && o.service_type !== 'container'
  const trips = isBulk
    ? Math.max(1, Number(o.grapple_runs) || 1)
    : await tripsForOrder(orderId, emptyCap, conn)
  const distance_km = km == null ? null : Math.round(km * 100) / 100
  const load_score = Math.round((trips + kmWeight * (km || 0)) * 1000) / 1000
  return { distance_km, trips, load_score }
}
