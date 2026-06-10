import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { goOnShift, finishShift } from '../src/services/driverShift.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkDriver() { const [d] = await db('drivers').insert({ name: 'Иванов' }).returning('*'); return d }
async function mkVehicle() { const [v] = await db('vehicles').insert({ gov_number: 'А001АА', mileage: 1000 }).returning('*'); return v }
const DATE = '2026-06-09'

describe('driverShift', () => {
  it('goOnShift создаёт present-строку с пробегом и обновляет mileage машины', async () => {
    const d = await mkDriver(); const v = await mkVehicle()
    const row = await goOnShift(d.id, { date: DATE, vehicleId: v.id, odometerStart: 1500 })
    expect(row.status).toBe('present')
    expect(row.vehicle_id).toBe(v.id)
    expect(row.odometer_start).toBe(1500)
    const veh = await db('vehicles').where({ id: v.id }).first()
    expect(veh.mileage).toBe(1500)
  })

  it('goOnShift поверх отсутствия строки (present-by-default) — создаёт новую', async () => {
    const d = await mkDriver()
    const before = await db('shifts').where({ driver_id: d.id, date: DATE })
    expect(before).toHaveLength(0)
    await goOnShift(d.id, { date: DATE, odometerStart: 100 })
    const after = await db('shifts').where({ driver_id: d.id, date: DATE })
    expect(after).toHaveLength(1)
  })

  it('finishShift пишет odometer_end', async () => {
    const d = await mkDriver(); const v = await mkVehicle()
    await goOnShift(d.id, { date: DATE, vehicleId: v.id, odometerStart: 1500 })
    const row = await finishShift(d.id, { date: DATE, odometerEnd: 1620 })
    expect(row.odometer_end).toBe(1620)
  })

  it('finishShift без выхода на смену → 409', async () => {
    const d = await mkDriver()
    await expect(finishShift(d.id, { date: DATE, odometerEnd: 50 })).rejects.toThrow()
  })
})
