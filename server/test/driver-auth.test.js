import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { issueLink, bindByCode, resolveDriverByChat, unbind } from '../src/services/driverAuth.js'
import { setSetting } from '../src/services/settings.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

async function mkDriver(name = 'Иванов') {
  const [d] = await db('drivers').insert({ name }).returning('*')
  return d
}

describe('driverAuth — привязка по ссылке', () => {
  it('issueLink даёт 6-значный код и ссылку с ним (если бот настроен)', async () => {
    await setSetting('driver_bot_username', { username: 'putevo_driver_bot' })
    const d = await mkDriver()
    const { code, url } = await issueLink(d.id)
    expect(code).toMatch(/^\d{6}$/)
    expect(url).toContain(`start=${code}`)
  })

  it('bindByCode привязывает chat, resolve находит водителя, повторно — идемпотентно', async () => {
    const d = await mkDriver()
    const { code } = await issueLink(d.id)
    const row = await bindByCode(code, 555001)
    expect(Number(row.owner_id)).toBe(d.id)
    expect(String(row.external_id)).toBe('555001')

    const drv = await resolveDriverByChat(555001)
    expect(drv.id).toBe(d.id)

    // новая ссылка + bind того же чата → один привязанный канал, не дубль
    const { code: code2 } = await issueLink(d.id)
    await bindByCode(code2, 555001)
    const bound = await db('channels').where({ type: 'telegram', external_id: '555001' }).whereNotNull('verified_at')
    expect(bound).toHaveLength(1)
  })

  it('resolveDriverByChat для непривязанного → null', async () => {
    expect(await resolveDriverByChat(999999)).toBeNull()
  })

  it('unbind отвязывает чат', async () => {
    const d = await mkDriver()
    await bindByCode((await issueLink(d.id)).code, 700)
    await unbind(700)
    expect(await resolveDriverByChat(700)).toBeNull()
  })
})
