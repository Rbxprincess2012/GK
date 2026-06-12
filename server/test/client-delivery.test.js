import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { sendReportToClient } from '../src/services/clientDelivery.js'
import { issuePersonInvite, bindPersonByCode } from '../src/services/trustedPersonChannels.js'

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

  it('шлёт и активному доверенному лицу объекта (+ к получателю клиента)', async () => {
    const { cl, order } = await fixture()
    const [tp] = await db('trusted_persons')
      .insert({ client_id: cl.id, name: 'Иван', tg_chat_id: 999, tg_status: 'active' }).returning('*')
    await db('object_trusted_persons').insert({ object_id: order.object_id, trusted_person_id: tp.id, section_id: null })
    const calls = []
    const fetchImpl = async (url, opts) => { calls.push(String(JSON.parse(opts.body).chat_id)); return { json: async () => ({ ok: true }) } }
    const res = await sendReportToClient(order.id, { body: 'отчёт', token: 't', fetchImpl })
    expect(res).toEqual({ sent: 2, failed: 0, recipients: 2 }) // 111 (клиент) + 999 (лицо)
    expect(calls.sort()).toEqual(['111', '999'])
  })

  it('лицо без онбординга (pending/нет chat_id) — не получает', async () => {
    const { cl, order } = await fixture()
    const [tp] = await db('trusted_persons')
      .insert({ client_id: cl.id, name: 'Пётр', tg_status: 'pending' }).returning('*')
    await db('object_trusted_persons').insert({ object_id: order.object_id, trusted_person_id: tp.id, section_id: null })
    const calls = []
    const fetchImpl = async (url, opts) => { calls.push(String(JSON.parse(opts.body).chat_id)); return { json: async () => ({ ok: true }) } }
    const res = await sendReportToClient(order.id, { body: 'x', token: 't', fetchImpl })
    expect(res.recipients).toBe(1) // только клиентский получатель
    expect(calls).toEqual(['111'])
  })
})

describe('онбординг доверенного лица', () => {
  it('issue → bind по коду → active с chat_id; повторный bind → null', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'Y', default_payment_method: 'cash' }).returning('*')
    const [tp] = await db('trusted_persons').insert({ client_id: cl.id, name: 'Пётр' }).returning('*')
    const inv = await issuePersonInvite(tp.id)
    expect(inv.tg_status).toBe('pending')
    expect(inv.tg_verify_code).toMatch(/^\d{6}$/)
    const bound = await bindPersonByCode(inv.tg_verify_code, { chat_id: 555 })
    expect(bound.tg_status).toBe('active')
    expect(String(bound.tg_chat_id)).toBe('555')
    const again = await bindPersonByCode(inv.tg_verify_code, { chat_id: 777 })
    expect(again).toBeNull()
  })
})
