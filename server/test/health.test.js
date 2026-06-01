import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('health', () => {
  it('GET /api/health -> { ok: true }', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
