import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { issueInvite, bindByCode, listForClient, revoke } from '../src/services/clientRecipients.js'

const app = createApp()
beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkClient() {
  const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'ООО Ромашка', default_payment_method: 'cash' }).returning('*')
  return cl
}

describe('clientRecipients — онбординг-модель', () => {
  it('issueInvite создаёт pending-строку с кодом', async () => {
    const cl = await mkClient()
    const r = await issueInvite(cl.id, 'dm')
    expect(r.status).toBe('pending')
    expect(r.kind).toBe('dm')
    expect(r.verify_code).toMatch(/^\d{6}$/)
    expect(r.chat_id).toBeNull()
  })

  it('bindByCode привязывает chat_id+title и переводит в active; код гасится', async () => {
    const cl = await mkClient()
    const r = await issueInvite(cl.id, 'dm')
    const bound = await bindByCode(r.verify_code, { chat_id: 111, kind: 'dm', title: 'Иван @ivan' })
    expect(bound.status).toBe('active')
    expect(String(bound.chat_id)).toBe('111')
    expect(bound.title).toBe('Иван @ivan')
    expect(bound.verify_code).toBeNull()
    // повтор того же кода → null (уже погашен)
    expect(await bindByCode(r.verify_code, { chat_id: 222, kind: 'dm', title: 'X' })).toBeNull()
  })

  it('bindByCode отвергает несовпадение kind (dm-код в группу)', async () => {
    const cl = await mkClient()
    const r = await issueInvite(cl.id, 'dm')
    expect(await bindByCode(r.verify_code, { chat_id: 333, kind: 'group', title: 'Группа' })).toBeNull()
  })

  it('bindByCode с несуществующим кодом → null', async () => {
    expect(await bindByCode('000000', { chat_id: 1, kind: 'dm', title: 'X' })).toBeNull()
  })

  it('bindByCode: чат другого активного клиента → { error: chat_taken }, без 500', async () => {
    const a = await mkClient()
    const b = await db('clients').insert({ type: 'ooo', legal_name: 'ООО Вторая', default_payment_method: 'cash' }).returning('*').then(([x]) => x)
    const ra = await issueInvite(a.id, 'group')
    const bound = await bindByCode(ra.verify_code, { chat_id: -999, kind: 'group', title: 'Нефтехим' })
    expect(bound.status).toBe('active')
    const rb = await issueInvite(b.id, 'group')
    const res = await bindByCode(rb.verify_code, { chat_id: -999, kind: 'group', title: 'АЛВА' })
    expect(res).toEqual({ error: 'chat_taken', title: 'Нефтехим' })
    // привязка Нефтехима не пострадала
    expect((await db('client_recipients').where({ id: ra.id }).first()).status).toBe('active')
  })

  it('bindByCode: ту же группу можно привязать заново после revoke (индекс освобождён)', async () => {
    const cl = await mkClient()
    const r1 = await issueInvite(cl.id, 'group')
    const b1 = await bindByCode(r1.verify_code, { chat_id: -777, kind: 'group', title: 'Группа' })
    await revoke(b1.id)
    const r2 = await issueInvite(cl.id, 'group')
    const b2 = await bindByCode(r2.verify_code, { chat_id: -777, kind: 'group', title: 'Группа снова' })
    expect(b2.status).toBe('active')
    expect(String(b2.chat_id)).toBe('-777')
  })

  it('revoke → status=revoked; listForClient отдаёт по клиенту', async () => {
    const cl = await mkClient()
    const r = await issueInvite(cl.id, 'group')
    const rev = await revoke(r.id)
    expect(rev.status).toBe('revoked')
    const list = await listForClient(cl.id)
    expect(list.map((x) => x.id)).toContain(r.id)
  })
})

describe('clientRecipients — роуты', () => {
  it('POST /clients/:id/recipients/dm → 201 + invite_link с кодом', async () => {
    const cl = await mkClient()
    const res = await request(app).post(`/api/clients/${cl.id}/recipients/dm`)
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('dm')
    // invite_link может быть null без username бота, но verify_code обязан быть
    expect(res.body.verify_code).toMatch(/^\d{6}$/)
  })

  it('GET /clients/:id/recipients → список; DELETE /recipients/:id → revoked', async () => {
    const cl = await mkClient()
    const created = (await request(app).post(`/api/clients/${cl.id}/recipients/group`)).body
    const list = (await request(app).get(`/api/clients/${cl.id}/recipients`)).body
    expect(list.map((x) => x.id)).toContain(created.id)
    const del = await request(app).delete(`/api/recipients/${created.id}`)
    expect(del.status).toBe(200)
    expect(del.body.status).toBe('revoked')
  })
})
