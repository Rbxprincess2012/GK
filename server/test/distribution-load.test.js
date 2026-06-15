import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { driverLoadHistory } from '../src/services/distribution.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkClientObject() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  return { cl, obj }
}
async function order({ cl, obj, driver_id, shift_date, status = 'assigned', load_score = 0, trips = 0, distance_km = 0 }) {
  await db('orders').insert({
    client_id: cl.id, object_id: obj.id, payment_method: 'cashless',
    assigned_driver_id: driver_id, shift_date, status, load_score, trips, distance_km,
  })
}

describe('driverLoadHistory — накопленная нагрузка за скользящее окно', () => {
  it('нормирует балл на «смену» (число дней окна с назначениями); среднее по работавшим', async () => {
    const { cl, obj } = await mkClientObject()
    const [a] = await db('drivers').insert({ name: 'A', is_active: true }).returning('*')
    const [b] = await db('drivers').insert({ name: 'B', is_active: true }).returning('*')
    // A: 2 заявки в 2 РАЗНЫХ дня окна, баллы 3 и 5 → score 8, смен 2, на смену 4
    await order({ cl, obj, driver_id: a.id, shift_date: '2026-06-10', load_score: 3, trips: 1 })
    await order({ cl, obj, driver_id: a.id, shift_date: '2026-06-12', load_score: 5, trips: 2 })
    // B: 1 заявка, балл 10 → score 10, смен 1, на смену 10
    await order({ cl, obj, driver_id: b.id, shift_date: '2026-06-11', load_score: 10, trips: 3 })
    // шум: вне окна / status new / cancelled — не учитываются
    await order({ cl, obj, driver_id: a.id, shift_date: '2026-06-01', load_score: 99 })
    await order({ cl, obj, driver_id: b.id, shift_date: '2026-06-13', status: 'new', load_score: 99 })
    await order({ cl, obj, driver_id: b.id, shift_date: '2026-06-13', status: 'cancelled', load_score: 99 })

    const r = await driverLoadHistory('2026-06-14', 7)
    expect(r.from).toBe('2026-06-08')
    expect(r.to).toBe('2026-06-14')
    const A = r.drivers.find((d) => d.name === 'A')
    const B = r.drivers.find((d) => d.name === 'B')
    expect(A).toMatchObject({ score: 8, shift_days: 2, score_per_shift: 4, orders: 2, trips: 3 })
    expect(B).toMatchObject({ score: 10, shift_days: 1, score_per_shift: 10, orders: 1 })
    expect(r.avg_per_shift).toBe(7) // (4 + 10) / 2
  })

  it('водитель без заявок в окне → нули, не падает', async () => {
    await db('drivers').insert({ name: 'Z', is_active: true })
    const r = await driverLoadHistory('2026-06-14', 7)
    const Z = r.drivers.find((d) => d.name === 'Z')
    expect(Z).toMatchObject({ score: 0, shift_days: 0, score_per_shift: 0, orders: 0 })
    expect(r.avg_per_shift).toBe(0)
  })
})
