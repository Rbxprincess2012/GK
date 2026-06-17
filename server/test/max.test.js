import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { MaxApi } from '../src/lib/maxApi.js'
import { Bot, InlineKeyboard } from '../src/lib/maxgram.js'
import { putFromMax } from '../src/services/mediaStore.js'
import { sendReportToClient } from '../src/services/clientDelivery.js'
import { bindByCode as driverBind, resolveDriverByChat, issueLink } from '../src/services/driverAuth.js'
import { setSetting } from '../src/services/settings.js'
import { issueCode } from '../src/services/channels.js'
import { issuePersonInvite, bindPersonByCode } from '../src/services/trustedPersonChannels.js'
import { issueInvite, bindByCode as recipBind, ensureGroupInvite, groupRecipient } from '../src/services/clientRecipients.js'
import { createMaxClientBot } from '../src/bot/maxClientBot.js'

afterAll(() => db.destroy())

// recordFetch: записывает вызовы, отдаёт управляемый ответ (JSON + arrayBuffer для скачивания).
function recorder(handler) {
  const calls = []
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts })
    return handler ? handler(String(url), opts) : { ok: true, status: 200, json: async () => ({}) }
  }
  return { calls, fetchImpl }
}

describe('maxApi — формирование запросов', () => {
  it('Authorization без Bearer, адресация ?user_id=, тело с format', async () => {
    const { calls, fetchImpl } = recorder()
    const api = new MaxApi('TKN', { fetchImpl })
    await api.sendMessage({ userId: 5 }, { text: 'hi', format: 'html' })
    const c = calls[0]
    expect(c.url).toContain('platform-api.max.ru/messages')
    expect(c.url).toContain('user_id=5')
    expect(c.opts.headers.Authorization).toBe('TKN')
    expect(JSON.parse(c.opts.body)).toMatchObject({ text: 'hi', format: 'html' })
  })

  it('чат адресуется ?chat_id=, getUpdates несёт marker/timeout, answers — callback_id', async () => {
    const { calls, fetchImpl } = recorder()
    const api = new MaxApi('TKN', { fetchImpl })
    await api.sendMessage({ chatId: 77 }, { text: 'x' })
    expect(calls.at(-1).url).toContain('chat_id=77')
    await api.getUpdates({ marker: 42, timeout: 30 })
    expect(calls.at(-1).url).toContain('marker=42')
    expect(calls.at(-1).url).toContain('timeout=30')
    await api.answerCallback('cb1', { notification: 'ок' })
    expect(calls.at(-1).url).toContain('/answers')
    expect(calls.at(-1).url).toContain('callback_id=cb1')
  })

  it('ретрай на 429 затем успех', async () => {
    let n = 0
    const fetchImpl = async () => (++n < 2 ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ ok: true }) })
    const api = new MaxApi('T', { fetchImpl })
    const out = await api.getMe()
    expect(n).toBe(2)
    expect(out.ok).toBe(true)
  })
})

describe('maxgram — маппинг апдейтов и клавиатура', () => {
  it('InlineKeyboard → MAX attachment', () => {
    const a = new InlineKeyboard().text('A', 'a').row().text('B', 'b').toAttachment()
    expect(a).toEqual({
      type: 'inline_keyboard',
      payload: { buttons: [[{ type: 'callback', text: 'A', payload: 'a' }], [{ type: 'callback', text: 'B', payload: 'b' }]] },
    })
  })

  it('bot_started → start с payload; message /bind → команда; callback → data', async () => {
    const bot = new Bot('T', { fetchImpl: recorder().fetchImpl })
    const seen = {}
    bot.command('start', (ctx) => { seen.start = ctx.match; seen.chat = ctx.chat.id; seen.user = ctx.from.id })
    bot.command('bind', (ctx) => { seen.bind = ctx.match })
    bot.on('callback_query:data', (ctx) => { seen.cb = ctx.callbackQuery.data })
    bot.on('message', (ctx) => { seen.msg = ctx.message.text })

    await bot._handle({ update_type: 'bot_started', chat_id: 50, user: { user_id: 7, name: 'A' }, payload: 'p12' })
    expect(seen).toMatchObject({ start: 'p12', chat: 50, user: 7 })

    await bot._handle({ update_type: 'message_created', message: { sender: { user_id: 7 }, recipient: { chat_id: 50, chat_type: 'chat' }, body: { text: '/bind 999' } } })
    expect(seen.bind).toBe('999')

    await bot._handle({ update_type: 'message_callback', callback: { callback_id: 'c1', payload: 'sd:1:2', user: { user_id: 7 } }, message: { recipient: { chat_id: 50 } } })
    expect(seen.cb).toBe('sd:1:2')
  })

  it('ctx.reply шлёт сообщение с inline_keyboard attachment', async () => {
    const { calls, fetchImpl } = recorder()
    const bot = new Bot('T', { fetchImpl })
    bot.command('k', async (ctx) => ctx.reply('hi', { reply_markup: new InlineKeyboard().text('Yes', 'y') }))
    await bot._handle({ update_type: 'message_created', message: { sender: { user_id: 7 }, recipient: { chat_id: 50, chat_type: 'dialog' }, body: { text: '/k' } } })
    const send = calls.find((c) => c.url.includes('/messages'))
    expect(send.url).toContain('chat_id=50')
    const body = JSON.parse(send.opts.body)
    expect(body.text).toBe('hi')
    expect(body.attachments[0]).toEqual({ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: 'Yes', payload: 'y' }]] } })
  })

  it('bot_added в клиентском боте — НЕ шлёт авто-сообщение (менеджер добавляет молча)', async () => {
    const { calls, fetchImpl } = recorder()
    const bot = createMaxClientBot('T')
    bot.api.fetchImpl = fetchImpl // бот создаётся без инъекции — подменяем fetch у api
    await bot._handle({ update_type: 'bot_added', chat_id: 70, user: { user_id: 7, name: 'A' }, is_channel: false })
    expect(calls.find((c) => c.url.includes('/messages'))).toBeUndefined()
  })
})

describe('channel-aware онбординг', () => {
  beforeEach(resetDb)

  it('водитель: bind по MAX-каналу, резолв изолирован от telegram', async () => {
    const [d] = await db('drivers').insert({ name: 'Вод' }).returning('*')
    const { code } = await issueCode({ owner_kind: 'driver', owner_id: d.id, type: 'max' })
    await driverBind(code, 12345, 'max')
    expect((await resolveDriverByChat(12345, 'max'))?.id).toBe(d.id)
    expect(await resolveDriverByChat(12345, 'telegram')).toBeNull() // другой канал — не видит
    await setSetting('max_driver_bot_username', { username: 'putevo_max_driver_bot' })
    expect(await issueLink(d.id, 'max')).toMatchObject({ url: expect.stringContaining('https://max.ru/') })
  })

  it('лицо: MAX-онбординг пишет max_*, не трогая tg_*', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'Z', default_payment_method: 'cash' }).returning('*')
    const [tp] = await db('trusted_persons').insert({ client_id: cl.id, name: 'Лицо' }).returning('*')
    const inv = await issuePersonInvite(tp.id, 'max')
    expect(inv.max_status).toBe('pending')
    const bound = await bindPersonByCode(inv.max_verify_code, { chat_id: 888, channel: 'max' })
    expect(bound.max_status).toBe('active')
    expect(String(bound.max_chat_id)).toBe('888')
    expect(bound.tg_status).toBeNull()
  })

  it('получатель клиента: канал сохраняется в строке', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'Z', default_payment_method: 'cash' }).returning('*')
    const inv = await issueInvite(cl.id, 'dm', 'max')
    expect(inv.channel).toBe('max')
    const bound = await recipBind(inv.verify_code, { chat_id: 999, kind: 'dm', title: 'T', channel: 'max' })
    expect(bound.channel).toBe('max')
    expect(String(bound.chat_id)).toBe('999')
  })

  it('группа: ensureGroupInvite идемпотентен — повторный вызов не плодит дубли pending', async () => {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'G', default_payment_method: 'cash' }).returning('*')
    const a = await ensureGroupInvite(cl.id, 'max')
    const b = await ensureGroupInvite(cl.id, 'max')
    expect(b.id).toBe(a.id) // переиспользовали ту же pending-строку
    const rows = await db('client_recipients').where({ client_id: cl.id, kind: 'group', channel: 'max' })
    expect(rows).toHaveLength(1)
    // groupRecipient возвращает её же; telegram-канал — отдельная строка/состояние
    expect((await groupRecipient(cl.id, 'max'))?.id).toBe(a.id)
    expect(await groupRecipient(cl.id, 'telegram')).toBeUndefined()
  })
})

describe('доставка — диспатч по каналам', () => {
  beforeEach(resetDb)

  async function order() {
    const [cl] = await db('clients').insert({ type: 'ooo', legal_name: 'X', default_payment_method: 'cash' }).returning('*')
    const [ob] = await db('objects').insert({ client_id: cl.id }).returning('*')
    const [o] = await db('orders').insert({ client_id: cl.id, object_id: ob.id, payment_method: 'cash', status: 'done' }).returning('*')
    return { cl, ob, o }
  }

  it('лицо с двумя активными каналами → два таргета (telegram + max)', async () => {
    const { cl, ob, o } = await order()
    const [tp] = await db('trusted_persons').insert({
      client_id: cl.id, name: 'Иван', tg_chat_id: 111, tg_status: 'active', max_chat_id: 222, max_status: 'active',
    }).returning('*')
    await db('object_trusted_persons').insert({ object_id: ob.id, trusted_person_id: tp.id, section_id: null })
    const hosts = []
    const fetchImpl = async (url) => { hosts.push(new URL(url).host); return { ok: true, status: 200, json: async () => ({ ok: true }) } }
    const res = await sendReportToClient(o.id, { body: 'r', token: 't', fetchImpl })
    expect(res).toEqual({ sent: 2, failed: 0, recipients: 2 })
    expect(hosts.sort()).toEqual(['api.telegram.org', 'platform-api.max.ru'])
  })

  it('блок MAX-канала (403) ревокает только max_status, telegram остаётся', async () => {
    const { cl, ob, o } = await order()
    const [tp] = await db('trusted_persons').insert({
      client_id: cl.id, name: 'Пётр', tg_chat_id: 111, tg_status: 'active', max_chat_id: 222, max_status: 'active',
    }).returning('*')
    await db('object_trusted_persons').insert({ object_id: ob.id, trusted_person_id: tp.id, section_id: null })
    const fetchImpl = async (url) => (String(url).includes('platform-api.max.ru')
      ? { ok: false, status: 403, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ ok: true }) })
    const res = await sendReportToClient(o.id, { body: 'r', token: 't', fetchImpl })
    expect(res).toEqual({ sent: 1, failed: 1, recipients: 2 })
    const row = await db('trusted_persons').where({ id: tp.id }).first()
    expect(row.max_status).toBe('revoked')
    expect(row.tg_status).toBe('active')
  })

  it('MAX-получатель клиента шлётся через platform-api.max.ru', async () => {
    const { cl, o } = await order()
    await db('client_recipients').insert({ client_id: cl.id, kind: 'dm', chat_id: 555, status: 'active', channel: 'max' })
    const hosts = []
    const fetchImpl = async (url) => { hosts.push(new URL(url).host); return { ok: true, status: 200, json: async () => ({ ok: true }) } }
    const res = await sendReportToClient(o.id, { body: 'r', fetchImpl })
    expect(res).toEqual({ sent: 1, failed: 0, recipients: 1 })
    expect(hosts).toEqual(['platform-api.max.ru'])
  })
})

describe('putFromMax — скачивание медиа', () => {
  const dir = path.join(os.tmpdir(), `maxmedia-${Date.now()}`)

  it('фото: прямой payload.url с Authorization', async () => {
    const seen = []
    const fetchImpl = async (url, opts) => {
      seen.push({ url: String(url), auth: opts?.headers?.Authorization })
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    }
    const out = await putFromMax({ type: 'image', url: 'https://cdn.max/x.jpg' }, { token: 'TK', fetchImpl, dir })
    expect(out).toMatch(/^\/media\/.+\.jpg$/)
    expect(seen[0]).toMatchObject({ url: 'https://cdn.max/x.jpg', auth: 'TK' })
  })

  it('видео: token → GET /videos/{token} → mp4 url', async () => {
    const fetchImpl = async (url) => (String(url).includes('/videos/')
      ? { ok: true, status: 200, json: async () => ({ urls: { mp4_720: 'https://cdn.max/v.mp4' } }) }
      : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9]).buffer })
    const out = await putFromMax({ type: 'video', token: 'vt' }, { token: 'TK', fetchImpl, dir })
    expect(out).toMatch(/^\/media\/.+\.mp4$/)
  })
})
