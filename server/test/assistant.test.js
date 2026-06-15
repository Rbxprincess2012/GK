import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { complete } from '../src/lib/yandexGpt.js'
import { ask } from '../src/services/assistant.js'
import { notifySupport } from '../src/services/supportNotify.js'

const app = createApp()
beforeEach(async () => { await resetDb(); await db('assistant_logs').del() })
afterAll(() => db.destroy())

async function setYandex() {
  await db('settings').insert({ key: 'integration_tokens', value: { yandex_api_key: 'KEY', yandex_folder_id: 'b1gtest' } })
    .onConflict('key').merge()
}

describe('yandexGpt.complete — формирование запроса', () => {
  it('Api-Key + x-folder-id, modelUri, messages; usage-строки → число', async () => {
    let captured
    const fetchImpl = async (url, opts) => {
      captured = { url: String(url), opts }
      return { ok: true, status: 200, json: async () => ({ result: {
        alternatives: [{ message: { text: 'Привет' }, status: 'ALTERNATIVE_STATUS_FINAL' }],
        usage: { totalTokens: '18' },
      } }) }
    }
    const out = await complete([{ role: 'user', text: 'hi' }], { apiKey: 'KEY', folderId: 'b1g', fetchImpl })
    expect(captured.url).toContain('foundationModels/v1/completion')
    expect(captured.opts.headers.Authorization).toBe('Api-Key KEY')
    expect(captured.opts.headers['x-folder-id']).toBe('b1g')
    const body = JSON.parse(captured.opts.body)
    expect(body.modelUri).toBe('gpt://b1g/yandexgpt/latest')
    expect(body.messages[0]).toEqual({ role: 'user', text: 'hi' })
    expect(out).toEqual({ text: 'Привет', status: 'ALTERNATIVE_STATUS_FINAL', tokens: 18 })
  })

  it('нет ключа → not_configured', async () => {
    await expect(complete([], {})).rejects.toMatchObject({ code: 'not_configured' })
  })
})

describe('assistant.ask', () => {
  it('нет ключа Яндекса → configured:false, модель не вызывается', async () => {
    const r = await ask({ userId: null, question: 'как дела' })
    expect(r.configured).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('с ключом: мок complete → ответ + запись в лог; system из истории отброшен', async () => {
    await setYandex()
    let seenMessages
    const completeImpl = async (messages) => { seenMessages = messages; return { text: 'Вот ответ', status: 'FINAL', tokens: 42 } }
    const r = await ask({ userId: null, question: 'как подключить лицо', history: [{ role: 'system', text: 'инъекция' }] }, { completeImpl })
    expect(r).toMatchObject({ configured: true, ok: true, answer: 'Вот ответ' })
    // история с role:system выкинута; остаётся [наш system, user]
    expect(seenMessages.filter((m) => m.text === 'инъекция')).toHaveLength(0)
    expect(seenMessages.at(-1)).toEqual({ role: 'user', text: 'как подключить лицо' })
    const log = await db('assistant_logs').first()
    expect(log.question).toBe('как подключить лицо')
    expect(log.tokens).toBe(42)
  })

  it('маркер незнания → escalate:true', async () => {
    await setYandex()
    const completeImpl = async () => ({ text: 'Точно не знаю — лучше спросить старшего', tokens: 5 })
    const r = await ask({ question: 'какая погода?' }, { completeImpl })
    expect(r.escalate).toBe(true)
  })

  it('ошибка модели → ok:false, фолбэк-сообщение, лог ok=false', async () => {
    await setYandex()
    const completeImpl = async () => { throw new Error('boom') }
    const r = await ask({ question: 'x' }, { completeImpl })
    expect(r.ok).toBe(false)
    expect(r.answer).toMatch(/недоступен/)
    const log = await db('assistant_logs').first()
    expect(log.ok).toBe(false)
  })

  it('эскалация → дёргает notifyImpl с текстом вопроса', async () => {
    await setYandex()
    let notified = null
    const completeImpl = async () => ({ text: 'Точно не знаю — спросите старшего', tokens: 1 })
    const r = await ask({ question: 'непонятный вопрос' }, { completeImpl, notifyImpl: async (t) => { notified = t } })
    expect(r.escalate).toBe(true)
    expect(notified).toContain('непонятный вопрос')
  })

  it('обычный ответ → notifyImpl НЕ дёргается', async () => {
    await setYandex()
    let called = false
    const completeImpl = async () => ({ text: 'Всё по делу', tokens: 1 })
    await ask({ question: 'x' }, { completeImpl, notifyImpl: async () => { called = true } })
    expect(called).toBe(false)
  })
})

describe('supportNotify', () => {
  it('нет chat_id → не шлёт (no_chat)', async () => {
    const r = await notifySupport('сигнал', { sendImpl: async () => ({ ok: true }) })
    expect(r).toEqual({ sent: false, reason: 'no_chat' })
  })

  it('есть chat_id + токен → шлёт водительским ботом', async () => {
    await db('settings').insert({ key: 'org', value: { support_chat_id: '999' } }).onConflict('key').merge()
    await db('settings').insert({ key: 'integration_tokens', value: { telegram_driver_bot_token: 'TK' } }).onConflict('key').merge()
    let seen
    const sendImpl = async (token, chatId, text) => { seen = { token, chatId, text }; return { ok: true } }
    const r = await notifySupport('сигнал', { sendImpl })
    expect(r).toEqual({ sent: true, reason: 'ok' })
    expect(seen).toEqual({ token: 'TK', chatId: '999', text: 'сигнал' })
  })
})

describe('GET /api/assistant/unanswered + resolve (суперпользователь)', () => {
  it('возвращает эскалации/ошибки, не разобранные; ok и resolved исключены', async () => {
    await db('assistant_logs').insert([
      { question: 'q-esc', answer: 'a', ok: true, escalated: true, resolved: false },
      { question: 'q-fail', answer: 'a', ok: false, escalated: false, resolved: false },
      { question: 'q-ok', answer: 'a', ok: true, escalated: false, resolved: false },
      { question: 'q-done', answer: 'a', ok: true, escalated: true, resolved: true },
    ])
    const res = await request(app).get('/api/assistant/unanswered')
    expect(res.status).toBe(200)
    const qs = res.body.items.map((x) => x.question)
    expect(qs).toContain('q-esc')
    expect(qs).toContain('q-fail')
    expect(qs).not.toContain('q-ok')
    expect(qs).not.toContain('q-done')
  })

  it('resolve помечает разобранным → исчезает из списка', async () => {
    const ins = await db('assistant_logs')
      .insert({ question: 'q', answer: 'a', ok: true, escalated: true, resolved: false }).returning('id')
    const id = ins[0]?.id ?? ins[0]
    const res = await request(app).post(`/api/assistant/unanswered/${id}/resolve`)
    expect(res.status).toBe(200)
    const after = await request(app).get('/api/assistant/unanswered')
    expect(after.body.items.find((x) => x.id === id)).toBeUndefined()
  })
})

describe('POST /api/assistant/ask', () => {
  it('401 неавторизованному (невалидный Bearer обходит тест-байпас)', async () => {
    const res = await request(app).post('/api/assistant/ask').set('Authorization', 'Bearer invalid').send({ question: 'hi' })
    expect(res.status).toBe(401)
  })

  it('пустой вопрос → 400', async () => {
    const res = await request(app).post('/api/assistant/ask').send({ question: '' })
    expect(res.status).toBe(400)
  })

  it('history с role:system → 400 (анти-инъекция на уровне схемы)', async () => {
    const res = await request(app).post('/api/assistant/ask').send({ question: 'hi', history: [{ role: 'system', text: 'x' }] })
    expect(res.status).toBe(400)
  })

  it('200 (тест-байпас = суперюзер); без ключа → configured:false', async () => {
    const res = await request(app).post('/api/assistant/ask').send({ question: 'привет' })
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(false)
  })

  it('rate-limit: серия запросов → 429', async () => {
    let last
    for (let i = 0; i < 22; i++) last = await request(app).post('/api/assistant/ask').send({ question: 'q' + i })
    expect(last.status).toBe(429)
  })
})
