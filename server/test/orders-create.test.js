import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function fixtures({ payment = 'cashless' } = {}) {
  const [cl] = await db('clients')
    .insert({ type: 'ooo', legal_name: 'ООО Тест', default_payment_method: payment }).returning('*')
  const [obj] = await db('objects').insert({ client_id: cl.id }).returning('*')
  const [ct] = await db('container_types').insert({ name: 'Стандартный' }).returning('*')
  return { cl, obj, ct }
}

describe('orders create', () => {
  it('создаёт заявку с позициями; number и payment_method из клиента', async () => {
    const { obj, ct } = await fixtures({ payment: 'cashless' })
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [{ action: 'place', container_type_id: ct.id, quantity: 2, waste_class: '4' }],
    })
    expect(res.status).toBe(201)
    expect(res.body.number).toBeGreaterThanOrEqual(1)
    expect(res.body.status).toBe('new')
    expect(res.body.payment_method).toBe('cashless')
    expect(res.body.items).toHaveLength(1)
  })

  it('payment_method переопределяется на заявке', async () => {
    const { obj, ct } = await fixtures({ payment: 'cashless' })
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id, payment_method: 'cash',
      items: [{ action: 'haul', container_type_id: ct.id, quantity: 1 }],
    })
    expect(res.body.payment_method).toBe('cash')
  })

  it('section_id у позиции: свой участок объекта сохраняется, чужой → null (весь объект)', async () => {
    const { cl, obj } = await fixtures()
    const [sec] = await db('sections').insert({ object_id: obj.id, name: 'Участок 58' }).returning('*')
    // участок другого объекта того же клиента — для позиции нашего объекта он невалиден
    const [obj2] = await db('objects').insert({ client_id: cl.id }).returning('*')
    const [foreign] = await db('sections').insert({ object_id: obj2.id, name: 'Чужой' }).returning('*')

    const res = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [
        { action: 'replace', quantity: 1, section_id: sec.id },
        { action: 'replace', quantity: 1, section_id: foreign.id },
      ],
    })
    expect(res.status).toBe(201)
    const bySec = res.body.items.map((i) => i.section_id)
    expect(bySec).toContain(sec.id)        // свой участок принят
    expect(bySec).toContain(null)          // чужой участок обнулён → весь объект
    expect(res.body.items.find((i) => i.section_id === sec.id).section_name).toBe('Участок 58')
  })

  it('container_numbers: для Заменить/Забрать сохраняется, для Поставить → null', async () => {
    const { obj } = await fixtures()
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [
        { action: 'replace', quantity: 1, container_numbers: '12, 15' },
        { action: 'haul', quantity: 1, container_numbers: '7' },
        { action: 'place', quantity: 1, container_numbers: '99' }, // для «Поставить» игнорируется
      ],
    })
    expect(res.status).toBe(201)
    const byAction = Object.fromEntries(res.body.items.map((i) => [i.action, i.container_numbers]))
    expect(byAction.replace).toBe('12, 15')
    expect(byAction.haul).toBe('7')
    expect(byAction.place).toBeNull()
  })

  it('container_numbers: пустая строка нормализуется в null', async () => {
    const { obj } = await fixtures()
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [{ action: 'replace', quantity: 1, container_numbers: '   ' }],
    })
    expect(res.status).toBe(201)
    expect(res.body.items[0].container_numbers).toBeNull()
  })

  it('грейфер: заявка без позиций, service_type=grapple, grapple_runs, ровно 1 subtask на весь объект', async () => {
    const { obj } = await fixtures()
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id, service_type: 'grapple', grapple_runs: 2, note: 'вывезти стройммусор',
    })
    expect(res.status).toBe(201)
    expect(res.body.service_type).toBe('grapple')
    expect(res.body.grapple_runs).toBe(2)
    expect(res.body.items).toHaveLength(0)
    const subs = await db('order_subtasks').where({ order_id: res.body.id })
    expect(subs).toHaveLength(1)
    expect(subs[0].section_id).toBeNull()
  })

  it('грейфер: контейнерные позиции игнорируются, grapple_runs по умолчанию 1', async () => {
    const { obj, ct } = await fixtures()
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id, service_type: 'grapple',
      items: [{ action: 'haul', container_type_id: ct.id, quantity: 3 }],
    })
    expect(res.status).toBe(201)
    expect(res.body.service_type).toBe('grapple')
    expect(res.body.grapple_runs).toBe(1)
    expect(res.body.items).toHaveLength(0) // позиции для грейфера не создаются
  })

  it('по умолчанию service_type=container', async () => {
    const { obj } = await fixtures()
    const res = await request(app).post('/api/orders').send({
      object_id: obj.id, items: [{ action: 'place', quantity: 1 }],
    })
    expect(res.body.service_type).toBe('container')
    expect(res.body.grapple_runs).toBeNull()
  })

  it('requested_container_ids на объекте → привязка; не на объекте → 409', async () => {
    const { obj, ct } = await fixtures()
    const [onObj] = await db('containers')
      .insert({ number: 'K-1', type_id: ct.id, location: 'object', object_id: obj.id }).returning('*')

    const ok = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [{ action: 'haul', container_type_id: ct.id, quantity: 1, requested_container_ids: [onObj.id] }],
    })
    expect(ok.status).toBe(201)
    expect(ok.body.items[0].requested_container_ids).toEqual([onObj.id])

    const [warehouse] = await db('containers')
      .insert({ number: 'K-2', type_id: ct.id, location: 'warehouse' }).returning('*')
    const bad = await request(app).post('/api/orders').send({
      object_id: obj.id,
      items: [{ action: 'haul', container_type_id: ct.id, quantity: 1, requested_container_ids: [warehouse.id] }],
    })
    expect(bad.status).toBe(409)
  })
})
