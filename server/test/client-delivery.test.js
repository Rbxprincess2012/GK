import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { sendReportToClient } from '../src/services/clientDelivery.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function fixture() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cash' }).returning('*')
  const [ob] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [order] = await db('orders').insert({ client_id: cl.id, object_id: ob.id, payment_method: 'cash', status: 'done' }).returning('*')
  const [active] = await db('client_recipients').insert({ client_id: cl.id, kind: 'dm', chat_id: 111, status: 'active' }).returning('*')
  await db('client_recipients').insert({ client_id: cl.id, kind: 'dm', chat_id: 222, status: 'pending' })
  return { cl, order, active }
}

describe('clientDelivery — рассылка отчёта', () => {
  it('шлёт только active, считает sent, проставляет last_sent_at', async () => {
    const { order, active } = await fixture()
    const calls = []
    const fetchImpl = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { json: async () => ({ ok: true }) } }
    const res = await sendReportToClient(order.id, { body: 'привет', token: 't', fetchImpl })
    expect(res).toEqual({ sent: 1, failed: 0, recipients: 1 })
    expect(calls).toHaveLength(1)
    expect(String(calls[0].body.chat_id)).toBe('111')
    expect(calls[0].body.text).toBe('привет')
    const row = await db('client_recipients').where({ id: active.id }).first()
    expect(row.last_sent_at).not.toBeNull()
  })

  it('ошибка Telegram (ok:false) → failed', async () => {
    const { order } = await fixture()
    const fetchImpl = async () => ({ json: async () => ({ ok: false }) })
    const res = await sendReportToClient(order.id, { body: 'x', token: 't', fetchImpl })
    expect(res).toEqual({ sent: 0, failed: 1, recipients: 1 })
  })
})
