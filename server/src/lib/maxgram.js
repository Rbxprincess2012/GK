import { MaxApi } from './maxApi.js'

// Мини-framework «как grammY» поверх MAX Bot API: Bot / InlineKeyboard / session.
// Цель — портировать существующие grammY-боты с минимальным расхождением. Нормализуем апдейты
// MAX (bot_started / message_created / message_callback) в ctx, близкий к grammY.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Inline-клавиатура. Совместима по API с grammY (.text/.row), сериализуется в MAX-attachment. ──
export class InlineKeyboard {
  constructor() { this.rows = [[]] }
  text(label, payload) {
    this.rows[this.rows.length - 1].push({ type: 'callback', text: label, payload: String(payload) })
    return this
  }
  row() { this.rows.push([]); return this }
  toButtons() { return this.rows.filter((r) => r.length) }
  toAttachment() { return { type: 'inline_keyboard', payload: { buttons: this.toButtons() } } }
}

// Сырое grammY-подобное reply_markup ({ inline_keyboard:[[{text,callback_data}]] }) → MAX-attachment.
function rawMarkupToAttachment(rm) {
  if (!rm) return null
  if (rm instanceof InlineKeyboard) return rm.toAttachment()
  if (rm.type === 'inline_keyboard') return rm                       // уже MAX-attachment
  if (Array.isArray(rm.inline_keyboard)) {
    const buttons = rm.inline_keyboard.map((row) =>
      row.map((b) => (b.callback_data != null
        ? { type: 'callback', text: b.text, payload: String(b.callback_data) }
        : b)))
    return { type: 'inline_keyboard', payload: { buttons } }
  }
  return null
}

// ── Сессия (поверх инъектируемого storage). Семантика как у grammY-session. ──
export function session({ initial, storage, getSessionKey }) {
  return async (ctx, next) => {
    const key = getSessionKey(ctx)
    if (key == null) return next()
    let data = await storage.read(key)
    if (data === undefined) data = initial ? initial() : {}
    ctx.session = data
    await next()
    await storage.write(key, ctx.session)
  }
}

// ── Нормализация апдейтов MAX (поля сверены с OpenAPI TamTam + доки MAX) ──
const userOf = (u) => (u ? { id: u.user_id, name: u.name, first_name: u.name, username: u.username } : null)
const chatOf = (msg) => {
  const r = msg?.recipient || {}
  return { id: r.chat_id, type: r.chat_type }
}
function attachmentOf(a) {
  // Фото имеет type 'image'; payload несёт url (фото/файл/аудио) и/или token (видео/реюз).
  const p = a?.payload || {}
  return { type: a?.type, url: p.url || null, token: p.token || null, raw: a }
}
function messageOf(msg) {
  const b = msg?.body || {}
  return { mid: b.mid, text: b.text || '', attachments: (b.attachments || []).map(attachmentOf) }
}

function normalizeUpdate(u) {
  switch (u?.update_type) {
    case 'bot_started':
      // chat_id и payload — ПЛОСКИЕ поля верхнего уровня (не внутри message).
      return { kind: 'start', chat: { id: u.chat_id, type: 'dialog' }, from: userOf(u.user), payload: u.payload || '' }
    case 'bot_added':
      // Бота добавили в чат/канал. chat_id плоский; user — кто добавил; is_channel — канал ли это.
      // В MAX чат_id группы достаётся ТОЛЬКО из апдейтов (нет REST-списка) — это точка онбординга.
      return { kind: 'bot_added', chat: { id: u.chat_id, type: u.is_channel ? 'channel' : 'chat' }, from: userOf(u.user) }
    case 'message_callback': {
      const cb = u.callback || {}
      return {
        kind: 'callback', chat: chatOf(u.message), from: userOf(cb.user),
        callback: { id: cb.callback_id, data: cb.payload }, message: messageOf(u.message),
      }
    }
    case 'message_created':
      return { kind: 'message', chat: chatOf(u.message), from: userOf(u.message?.sender), message: messageOf(u.message) }
    default:
      return null // прочие типы (added/removed/edited и т.п.) игнорируем
  }
}

export class Bot {
  constructor(token, { fetchImpl, baseUrl } = {}) {
    this.api = new MaxApi(token, { fetchImpl, baseUrl })
    this._commands = new Map()
    this._callbackHandlers = []
    this._messageHandlers = []
    this._botAddedHandlers = []
    this._middlewares = []
    this._beforeSend = []
    this._errorHandler = null
    this._running = false
    this.me = null
  }

  command(name, handler) { this._commands.set(name.toLowerCase(), handler); return this }
  on(event, handler) {
    if (event === 'callback_query:data') this._callbackHandlers.push(handler)
    else if (event === 'message') this._messageHandlers.push(handler)
    else if (event === 'bot_added') this._botAddedHandlers.push(handler)
    return this
  }
  use(mw) { this._middlewares.push(mw); return this }
  catch(handler) { this._errorHandler = handler; return this }
  // Хук на исходящие: fn(payload, ctx) может мутировать payload (нав-кнопки, перенос строк).
  beforeSend(fn) { this._beforeSend.push(fn); return this }

  // ── Отправка ответа (grammY-подобные opts: parse_mode / reply_markup / link_preview_options) ──
  async _reply(ctx, text, opts = {}) {
    const payload = {
      text,
      format: opts.parse_mode === 'HTML' ? 'html'
        : opts.parse_mode === 'Markdown' || opts.parse_mode === 'MarkdownV2' ? 'markdown'
          : opts.format,
      keyboard: opts.reply_markup ?? opts.keyboard ?? null,
      disableLinkPreview: opts.link_preview_options?.is_disabled ?? opts.disableLinkPreview,
    }
    for (const hook of this._beforeSend) hook(payload, ctx)
    return this._send(ctx, payload)
  }

  _send(ctx, payload) {
    const att = rawMarkupToAttachment(payload.keyboard)
    const to = ctx.chat?.id != null ? { chatId: ctx.chat.id } : { userId: ctx.from?.id }
    return this.api.sendMessage(to, {
      text: payload.text,
      format: payload.format,
      attachments: att ? [att] : undefined,
      disableLinkPreview: payload.disableLinkPreview,
    })
  }

  _makeCtx(norm) {
    const ctx = {
      chat: norm.chat,
      from: norm.from,
      match: norm.kind === 'start' ? (norm.payload || '') : '',
      message: norm.message || null,
      callbackQuery: norm.kind === 'callback' ? { id: norm.callback.id, data: norm.callback.data } : null,
      session: undefined,
      api: this.api,
    }
    ctx.reply = (text, opts) => this._reply(ctx, text, opts)
    ctx.answerCallbackQuery = (opts = {}) => (norm.kind === 'callback'
      ? this.api.answerCallback(norm.callback.id, { notification: opts.text })
      : Promise.resolve())
    return ctx
  }

  async _dispatch(ctx, norm) {
    if (norm.kind === 'start') {
      const h = this._commands.get('start')
      if (h) await h(ctx)
      return
    }
    if (norm.kind === 'callback') {
      for (const h of this._callbackHandlers) await h(ctx)
      return
    }
    if (norm.kind === 'bot_added') {
      for (const h of this._botAddedHandlers) await h(ctx)
      return
    }
    // message_created
    const text = ctx.message?.text || ''
    const m = text.match(/^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/)
    if (m) {
      const name = m[1].toLowerCase()
      ctx.match = (m[2] || '').trim()
      const h = this._commands.get(name)
      if (h) { await h(ctx); return }
    }
    for (const h of this._messageHandlers) await h(ctx)
  }

  async _handle(update) {
    const norm = normalizeUpdate(update)
    if (!norm) return
    const ctx = this._makeCtx(norm)
    let i = -1
    const next = async () => {
      i++
      if (i < this._middlewares.length) return this._middlewares[i](ctx, next)
      return this._dispatch(ctx, norm)
    }
    try { await next() } catch (e) {
      if (this._errorHandler) await this._errorHandler(e)
      else console.error('[maxgram] error:', e)
    }
  }

  async start({ onStart } = {}) {
    this.me = await this.api.getMe()
    if (onStart) await onStart(this.me)
    this._running = true
    let marker
    while (this._running) {
      let res
      try { res = await this.api.getUpdates({ marker, timeout: 30 }) }
      catch { await sleep(2000); continue }
      if (res && res.status === 401) { console.error('[maxgram] 401 — неверный токен'); await sleep(5000); continue }
      for (const u of (res?.updates || [])) await this._handle(u)
      if (res?.marker != null) marker = res.marker
    }
  }

  stop() { this._running = false }
}
