import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function channel() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [ch] = await db('channels').insert({ owner_kind: 'client', owner_id: cl.id, type: 'telegram', external_id: 'tg-1', verified_at: db.fn.now() }).returning('*')
  return ch
}

describe('inbound — дедуп по external_message_id', () => {
  it('повтор апдейта не плодит строку', async () => {
    const ch = await channel()
    const body = { channel_id: ch.id, raw_text: 'поставьте лодочку', external_message_id: 'msg-1' }
    const a = await request(app).post('/api/inbound').send(body)
    const b = await request(app).post('/api/inbound').send(body)
    expect(a.status).toBe(201)
    expect(b.body.id).toBe(a.body.id)
    const cnt = await db('inbound_messages').where({ external_message_id: 'msg-1' }).count()
    expect(Number(cnt[0].count)).toBe(1)
  })
})

describe('outbox — poll / ack', () => {
  it('pending отдаёт события, ack помечает sent', async () => {
    await db('outbox').insert({ event_type: 'order_accepted', payload: {}, event_key: 'k1', status: 'pending' })
    const pend = await request(app).get('/api/outbox/pending')
    expect(pend.status).toBe(200)
    expect(pend.body.length).toBe(1)

    const ack = await request(app).post(`/api/outbox/${pend.body[0].id}/ack`)
    expect(ack.status).toBe(200)
    expect(ack.body.status).toBe('sent')

    const after = await request(app).get('/api/outbox/pending')
    expect(after.body.length).toBe(0)
  })
})
