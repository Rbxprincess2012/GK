import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { renderTemplate, buildDeepLink, buildReportToken, buildClientChatLink } from '../src/services/clientMessaging.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

// in_progress-заявка с 2 done-под-задачами и пруфами.
async function fixtures({ status = 'in_progress' } = {}) {
  const [cl] = await db('clients').insert({
    type: 'ooo', legal_name: 'ООО Ромашка', nickname: 'Ромашка',
    default_payment_method: 'cash',
  }).returning('*')
  const [dist] = await db('districts').insert({ name: 'Центральный' }).returning('*')
  const [st] = await db('streets').insert({ name: 'Северная', district_id: dist.id }).returning('*')
  const [ob] = await db('objects').insert({ client_id: cl.id, street_id: st.id, house: '12', city: 'Краснодар' }).returning('*')
  const [veh] = await db('vehicles').insert({ model: 'Volvo FM', gov_number: 'Х123ХХ123' }).returning('*')
  const [drv] = await db('drivers').insert({ name: 'Кузнецов А.', default_vehicle_id: veh.id }).returning('*')
  const [sec] = await db('sections').insert({ object_id: ob.id, name: 'Склад' }).returning('*')
  const [order] = await db('orders').insert({
    client_id: cl.id, object_id: ob.id, number: 390, status, assigned_driver_id: drv.id, vehicle_id: veh.id,
    shift_date: '2026-06-10', payment_method: 'cash', amount: 8500, desired_date: '2026-06-10',
  }).returning('*')
  const [s1] = await db('order_subtasks').insert({
    order_id: order.id, section_id: sec.id, sub_no: 1, status: 'done', proof_status: 'unreviewed',
  }).returning('*')
  const [s2] = await db('order_subtasks').insert({
    order_id: order.id, section_id: null, sub_no: 2, status: 'done', proof_status: 'unreviewed',
  }).returning('*')
  await db('attachments').insert({ order_id: order.id, subtask_id: s1.id, kind: 'photo', file_url: 'https://picsum.photos/seed/390a/600/400' })
  await db('attachments').insert({ order_id: order.id, subtask_id: s2.id, kind: 'photo', file_url: 'https://picsum.photos/seed/390b/600/400' })
  return { cl, ob, drv, order, s1, s2, sec }
}

describe('clientMessaging — чистые функции', () => {
  it('renderTemplate подставляет известные и оставляет неизвестные', () => {
    expect(renderTemplate('№{number} для {client}, {foo}', { number: 390, client: 'ООО' }))
      .toBe('№390 для ООО, {foo}')
  })
  it('buildDeepLink: телефон → t.me/+intl; 8 → 7; пусто → null', () => {
    expect(buildDeepLink('+79180001122', 'telegram')).toBe('https://t.me/+79180001122')
    expect(buildDeepLink('89180001122')).toBe('https://t.me/+79180001122')
    expect(buildDeepLink('')).toBeNull()
  })
  it('buildReportToken — 24 hex-символа', () => {
    expect(buildReportToken()).toMatch(/^[0-9a-f]{24}$/)
  })
  it('buildClientChatLink: @username, t.me, url, телефон, пусто', () => {
    expect(buildClientChatLink('@romashka')).toBe('https://t.me/romashka')
    expect(buildClientChatLink('t.me/joinchat/AbC')).toBe('https://t.me/joinchat/AbC')
    expect(buildClientChatLink('https://t.me/+abc')).toBe('https://t.me/+abc')
    expect(buildClientChatLink('+79180001122')).toBe('https://t.me/+79180001122')
    expect(buildClientChatLink('romashka_chat')).toBe('https://t.me/romashka_chat')
    expect(buildClientChatLink('')).toBeNull()
  })
})

describe('proof review — accept/reject', () => {
  it('GET /orders/:id отдаёт subtasks с proof_status и attachments', async () => {
    const { order } = await fixtures()
    const res = await request(app).get(`/api/orders/${order.id}`)
    expect(res.status).toBe(200)
    expect(res.body.subtasks).toHaveLength(2)
    expect(res.body.subtasks[0].proof_status).toBe('unreviewed')
    expect(res.body.subtasks[0].attachments).toHaveLength(1)
  })

  it('accept под-задачи → proof_status=accepted', async () => {
    const { s1 } = await fixtures()
    const res = await request(app).post(`/api/subtasks/${s1.id}/accept`)
    expect(res.status).toBe(200)
    expect(res.body.proof_status).toBe('accepted')
  })

  it('reject у done-заявки → под-задача pending+rejected, заявка in_progress, reject_count растёт', async () => {
    const { s1, order } = await fixtures({ status: 'done' })
    const res = await request(app).post(`/api/subtasks/${s1.id}/reject`).send({ comment: 'переснимите контейнер' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('pending')
    expect(res.body.proof_status).toBe('rejected')
    expect(res.body.reject_count).toBe(1)
    expect(res.body.review_comment).toBe('переснимите контейнер')
    const o = await db('orders').where({ id: order.id }).first()
    expect(o.status).toBe('in_progress')
  })

  it('reject без комментария → 400', async () => {
    const { s1 } = await fixtures()
    const res = await request(app).post(`/api/subtasks/${s1.id}/reject`).send({})
    expect(res.status).toBe(400)
  })
})

describe('подтверждение заявки менеджером → token + outbox + лог', () => {
  it('accept под-задач НЕ финализирует заявку (финал — отдельная кнопка)', async () => {
    const { order, s1, s2 } = await fixtures()
    await request(app).post(`/api/subtasks/${s1.id}/accept`)
    await request(app).post(`/api/subtasks/${s2.id}/accept`)
    const o = await db('orders').where({ id: order.id }).first()
    expect(o.status).toBe('in_progress') // не done
    expect(o.public_token).toBeNull()
    expect(await db('outbox').where({ event_type: 'client_report_ready', order_id: order.id })).toHaveLength(0)
  })

  it('POST /orders/:id/confirm: done, public_token, событие, сообщение с «ждём заказа»', async () => {
    const { order } = await fixtures({ status: 'awaiting_confirmation' })
    const res = await request(app).post(`/api/orders/${order.id}/confirm`)
    expect(res.status).toBe(200)

    const o = await db('orders').where({ id: order.id }).first()
    expect(o.status).toBe('done')
    expect(o.public_token).toBeTruthy()

    const evs = await db('outbox').where({ event_type: 'client_report_ready', order_id: order.id })
    expect(evs).toHaveLength(1)
    expect(evs[0].event_key).toBe(`report:${order.id}`)

    const msgs = await db('client_messages').where({ order_id: order.id })
    expect(msgs).toHaveLength(1)
    expect(msgs[0].body).toContain('№390')
    expect(msgs[0].body).toContain('Ждём вашего следующего заказа')
  })

  it('confirm не из awaiting_confirmation → 409', async () => {
    const { order } = await fixtures({ status: 'in_progress' })
    const res = await request(app).post(`/api/orders/${order.id}/confirm`)
    expect(res.status).toBe(409)
  })
})

describe('очередь и публичный отчёт', () => {
  it('GET /proof-review возвращает заявку с непросмотренными пруфами', async () => {
    const { order } = await fixtures()
    const res = await request(app).get('/api/proof-review')
    expect(res.status).toBe(200)
    expect(res.body.map((o) => o.id)).toContain(order.id)
  })

  it('GET /r/:token — 200 и содержит участок; мусор → 404', async () => {
    const { order } = await fixtures({ status: 'awaiting_confirmation' })
    await request(app).post(`/api/orders/${order.id}/confirm`)
    const o = await db('orders').where({ id: order.id }).first()
    const ok = await request(app).get(`/r/${o.public_token}`)
    expect(ok.status).toBe(200)
    expect(ok.text).toContain('Склад')
    const bad = await request(app).get('/r/нетакоготокена000000000')
    expect(bad.status).toBe(404)
  })
})
