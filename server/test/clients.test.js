import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

describe('clients CRUD', () => {
  it('create/get/update/delete', async () => {
    const post = await request(app).post('/api/clients')
      .send({ type: 'ooo', legal_name: 'ООО Ромашка', nickname: 'Ромашка' })
    expect(post.status).toBe(201)
    expect(post.body.default_payment_method).toBe('cashless')
    const id = post.body.id

    const get = await request(app).get(`/api/clients/${id}`)
    expect(get.status).toBe(200)
    expect(get.body.legal_name).toBe('ООО Ромашка')

    const patch = await request(app).patch(`/api/clients/${id}`).send({ nickname: 'Роза' })
    expect(patch.body.nickname).toBe('Роза')

    expect((await request(app).delete(`/api/clients/${id}`)).status).toBe(204)
    expect((await request(app).get(`/api/clients/${id}`)).status).toBe(404)
  })

  it('пустой legal_name -> 400', async () => {
    const res = await request(app).post('/api/clients').send({ type: 'ooo', legal_name: '' })
    expect(res.status).toBe(400)
  })
})
