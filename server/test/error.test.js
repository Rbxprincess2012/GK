import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('routing', () => {
  it('неизвестный /api-маршрут -> 404', async () => {
    const res = await request(createApp()).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })
})
