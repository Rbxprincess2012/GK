import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { ordersForDriver, assertOwnership } from '../src/services/driverScope.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkDriver(name) { const [d] = await db('drivers').insert({ name }).returning('*'); return d }
async function mkOrder(driverId, date = '2026-06-09') {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [ob] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [o] = await db('orders').insert({
    client_id: cl.id, object_id: ob.id, payment_method: 'cashless',
    status: 'in_progress', assigned_driver_id: driverId, shift_date: date,
  }).returning('*')
  return o
}

describe('driverScope — изоляция', () => {
  it('ordersForDriver отдаёт только заявки этого водителя', async () => {
    const a = await mkDriver('A'); const b = await mkDriver('B')
    await mkOrder(a.id); await mkOrder(a.id); await mkOrder(b.id)
    const aOrders = await ordersForDriver(a.id, { date: '2026-06-09' })
    expect(aOrders).toHaveLength(2)
    expect(aOrders.every((o) => o.assigned_driver_id === a.id)).toBe(true)
  })

  it('assertOwnership: чужая заявка → 403', async () => {
    const a = await mkDriver('A'); const b = await mkDriver('B')
    const ob = await mkOrder(b.id)
    await expect(assertOwnership(ob.id, a.id)).rejects.toMatchObject({ status: 403 })
    await expect(assertOwnership(ob.id, b.id)).resolves.toBeTruthy()
  })
})
