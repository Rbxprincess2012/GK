import { db } from '../db.js'
import { upsertShift } from './shifts.js'

// Тип смены day/night — заглушка (нигде не выводится). Бот всегда пишет дефолт 'day'.
const DEFAULT_SHIFT = 'day'

// «Вышел на смену»: ставим present + машину + пробег на старте поверх модели present-by-default
// (строки в shifts для водителя могло не быть — upsert её создаёт). Обновляем пробег машины.
export async function goOnShift(driverId, { date, vehicleId = null, odometerStart = null, shiftType = DEFAULT_SHIFT }) {
  const row = await upsertShift({
    driver_id: driverId, date, shift_type: shiftType,
    status: 'present', vehicle_id: vehicleId, odometer_start: odometerStart,
  })
  if (vehicleId && odometerStart != null) {
    await db('vehicles').where({ id: vehicleId }).update({ mileage: odometerStart })
  }
  return row
}

// «Завершить смену»: пишем пробег в конце. Требует, чтобы водитель ранее вышел на смену.
export async function finishShift(driverId, { date, odometerEnd, shiftType = DEFAULT_SHIFT }) {
  const [row] = await db('shifts')
    .where({ driver_id: driverId, date, shift_type: shiftType })
    .update({ odometer_end: odometerEnd }).returning('*')
  if (!row) throw Object.assign(new Error('not_on_shift'), { status: 409 })
  return row
}
