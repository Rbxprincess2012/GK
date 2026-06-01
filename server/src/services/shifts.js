import { db } from '../db.js'

export async function upsertShift(data) {
  const [row] = await db('shifts')
    .insert(data)
    .onConflict(['driver_id', 'date', 'shift_type'])
    .merge()
    .returning('*')
  return row
}

export function range(from, to) {
  return db('shifts').whereBetween('date', [from, to]).orderBy(['date', 'driver_id'])
}

export function removeShift({ driver_id, date, shift_type }) {
  return db('shifts').where({ driver_id, date, shift_type }).del()
}

// Доступные на смену = статус present; машина — из смены или дефолтная у водителя.
export function availableDrivers(date, shiftType) {
  return db('shifts as s')
    .join('drivers as dr', 'dr.id', 's.driver_id')
    .where({ 's.date': date, 's.shift_type': shiftType, 's.status': 'present' })
    .select('dr.id', 'dr.name', 'dr.phone',
      db.raw('COALESCE(s.vehicle_id, dr.default_vehicle_id) AS vehicle_id'),
      db.raw(`(SELECT v.capacity_slots FROM vehicles v
               WHERE v.id = COALESCE(s.vehicle_id, dr.default_vehicle_id)) AS capacity_slots`))
    .orderBy('dr.name')
}
