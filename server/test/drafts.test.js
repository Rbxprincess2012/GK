import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function seed() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cashless' }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id, informal_name: 'Догма 868' }).returning('*')
  const [type] = await db('container_types').insert({ name: 'Лодочка' }).returning('*')
  const [ch] = await db('channels').insert({ owner_kind: 'client', owner_id: cl.id, type: 'telegram', external_id: '12345' }).returning('*')
  return { cl, obj, type, ch }
}
const itemsOf = (type) => [{ action: 'replace', container_type_id: type.id, quantity: 2 }]

describe('order_drafts — создание из бота', () => {
  it('создаёт черновик, выводит client_id из канала, статус need_review', async () => {
    const { cl, ch } = await seed()
    const res = await request(app).post('/api/drafts').send({
      channel_id: ch.id,
      object_hint: 'Догма, участок 868',
      desired_date: '2026-06-03',
      task_text: 'Клиент просит срочно заменить контейнеры №32 и №56',
      raw_message: 'ребята привет, кровь из носу заменить...',
      ambiguities: ['уточнить класс отхода'],
      llm_extraction: { orders: [{ object_hint: 'Догма, участок 868', task_text: 'заменить №32 и №56' }] },
    })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('need_review')
    expect(res.body.client_id).toBe(cl.id)         // выведен из канала
    expect(res.body.object_id).toBeNull()          // не резолвили — это ок
    expect(res.body.task_text).toContain('№32')
    expect(res.body.ambiguities).toEqual(['уточнить класс отхода'])
    expect(res.body.llm_extraction.orders[0].object_hint).toBe('Догма, участок 868') // исходная выдача ИИ сохранена
  })

  it('неизвестный канал → 404', async () => {
    const res = await request(app).post('/api/drafts').send({ channel_id: 999999, task_text: 'x' })
    expect(res.status).toBe(404)
  })

  it('без task_text → 400 (валидатор)', async () => {
    const { ch } = await seed()
    const res = await request(app).post('/api/drafts').send({ channel_id: ch.id })
    expect(res.status).toBe(400)
  })
})

describe('order_drafts — список/получение', () => {
  it('список по умолчанию отдаёт только need_review', async () => {
    const { ch } = await seed()
    await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'a' })
    const d2 = (await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'b' })).body
    await request(app).post(`/api/drafts/${d2.id}/reject`).send({ reason: 'спам' })

    const list = (await request(app).get('/api/drafts')).body
    expect(list.length).toBe(1)
    expect(list[0].task_text).toBe('a')
  })
})

describe('order_drafts — promote', () => {
  it('promote создаёт заявку new с номером и помечает черновик promoted', async () => {
    const { obj, type, ch } = await seed()
    const draft = (await request(app).post('/api/drafts').send({
      channel_id: ch.id, object_hint: 'Догма', task_text: 'Заменить №32 и №56',
    })).body

    const res = await request(app).post(`/api/drafts/${draft.id}/promote`).send({
      object_id: obj.id, items: itemsOf(type),
    })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('new')
    expect(res.body.number).toBeGreaterThan(0)

    const after = (await request(app).get(`/api/drafts/${draft.id}`)).body
    expect(after.status).toBe('promoted')
    expect(after.promoted_order_id).toBe(res.body.id)
  })

  it('повторный promote → 409', async () => {
    const { obj, type, ch } = await seed()
    const draft = (await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'x' })).body
    await request(app).post(`/api/drafts/${draft.id}/promote`).send({ object_id: obj.id, items: itemsOf(type) })
    const again = await request(app).post(`/api/drafts/${draft.id}/promote`).send({ object_id: obj.id, items: itemsOf(type) })
    expect(again.status).toBe(409)
  })

  it('promote с несуществующим объектом → 404 (от createOrder)', async () => {
    const { type, ch } = await seed()
    const draft = (await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'x' })).body
    const res = await request(app).post(`/api/drafts/${draft.id}/promote`).send({ object_id: 999999, items: itemsOf(type) })
    expect(res.status).toBe(404)
    // черновик остаётся need_review — заявка не создана
    const after = (await request(app).get(`/api/drafts/${draft.id}`)).body
    expect(after.status).toBe('need_review')
  })
})

describe('order_drafts — reject', () => {
  it('reject → rejected + причина', async () => {
    const { ch } = await seed()
    const draft = (await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'x' })).body
    const res = await request(app).post(`/api/drafts/${draft.id}/reject`).send({ reason: 'не наш клиент' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(res.body.reject_reason).toBe('не наш клиент')
  })

  it('promote отклонённого → 409', async () => {
    const { obj, type, ch } = await seed()
    const draft = (await request(app).post('/api/drafts').send({ channel_id: ch.id, task_text: 'x' })).body
    await request(app).post(`/api/drafts/${draft.id}/reject`).send({})
    const res = await request(app).post(`/api/drafts/${draft.id}/promote`).send({ object_id: obj.id, items: itemsOf(type) })
    expect(res.status).toBe(409)
  })
})
