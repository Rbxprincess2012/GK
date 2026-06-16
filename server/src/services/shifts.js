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

// По умолчанию КАЖДЫЙ активный водитель на смене. Отсутствие отмечается вручную
// записью в shifts со статусом-отсутствием (absent — выходной, sick — болеет, vacation).
// Доступные = все активные минус отмеченные отсутствующими в этот день/смену.
const ABSENCE = ['absent', 'sick', 'vacation']

export function availableDrivers(date, shiftType) {
  return db('drivers as dr')
    .where('dr.is_active', true)
    .whereNotExists(function () {
      this.select('*').from('shifts as s')
        .whereRaw('s.driver_id = dr.id')
        .andWhere({ 's.date': date, 's.shift_type': shiftType })
        .whereIn('s.status', ABSENCE)
    })
    .leftJoin('shifts as s', function () {
      this.on('s.driver_id', 'dr.id')
        .andOnVal('s.date', date)
        .andOnVal('s.shift_type', shiftType)
    })
    .select('dr.id', 'dr.name', 'dr.phone',
      db.raw('COALESCE(s.vehicle_id, dr.default_vehicle_id) AS vehicle_id'),
      db.raw(`(SELECT v.capacity_slots FROM vehicles v
               WHERE v.id = COALESCE(s.vehicle_id, dr.default_vehicle_id)) AS capacity_slots`),
      db.raw(`(SELECT v.empty_capacity FROM vehicles v
               WHERE v.id = COALESCE(s.vehicle_id, dr.default_vehicle_id)) AS empty_capacity`),
      db.raw(`(SELECT v.kind FROM vehicles v
               WHERE v.id = COALESCE(s.vehicle_id, dr.default_vehicle_id)) AS vehicle_kind`),
      db.raw(`(SELECT COALESCE(array_agg(vct.container_type_id), '{}')
               FROM vehicle_container_types vct
               WHERE vct.vehicle_id = COALESCE(s.vehicle_id, dr.default_vehicle_id)) AS vehicle_sizes`))
    .orderBy('dr.name')
}
