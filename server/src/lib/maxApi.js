// Низкоуровневый HTTP-клиент Bot API мессенджера MAX (форк TamTam).
//  • База: https://platform-api.max.ru, авторизация заголовком `Authorization: <token>` (без Bearer).
//  • Адресат исходящего сообщения — QUERY-параметр (?user_id= для лички, ?chat_id= для чата),
//    НЕ поле тела. Тело — NewMessageBody { text, format:'markdown'|'html', attachments, notify }.
//  • Апдейты — long-polling GET /updates с marker; callback-ответ POST /answers?callback_id=.
//  • Медиа: фото/файл/аудио уже несут payload.url; видео — через GET /videos/{token}.
// fetchImpl/baseUrl инъектируются в тестах. Лимит платформы — 30 rps.
const BASE_URL = 'https://platform-api.max.ru'

export class MaxApi {
  constructor(token, { fetchImpl = fetch, baseUrl = BASE_URL } = {}) {
    this.token = token
    this.fetchImpl = fetchImpl
    this.baseUrl = baseUrl
  }

  // Единая точка HTTP. method — GET|POST|PUT|DELETE; query/body опциональны. Ретрай на 429/503.
  async call(method, path, { query, body } = {}, attempt = 0) {
    const url = new URL(this.baseUrl + path)
    for (const [k, v] of Object.entries(query || {})) {
      if (v != null) url.searchParams.set(k, String(v))
    }
    const res = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: this.token,
        ...(body != null ? { 'content-type': 'application/json' } : {}),
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    })
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      return this.call(method, path, { query, body }, attempt + 1)
    }
    // Тело ответа — JSON; на пустом (204) вернём {}. Ошибки не бросаем — отдаём как есть, чтобы
    // вызывающий мог отличить 403/400 (блок/удалён чат) от сетевого сбоя.
    let data = {}
    try { data = await res.json() } catch { /* пусто/не-JSON */ }
    return { ok: res.ok, status: res.status, ...data }
  }

  getMe() {
    return this.call('GET', '/me')
  }

  // Отправить сообщение. to — { userId } (личка) или { chatId } (чат).
  sendMessage(to, { text, format, attachments, notify, disableLinkPreview } = {}) {
    const query = {}
    if (to?.userId != null) query.user_id = to.userId
    if (to?.chatId != null) query.chat_id = to.chatId
    if (disableLinkPreview != null) query.disable_link_preview = disableLinkPreview
    const body = { text }
    if (format) body.format = format
    if (attachments) body.attachments = attachments
    if (notify != null) body.notify = notify
    return this.call('POST', '/messages', { query, body })
  }

  editMessage(messageId, body) {
    return this.call('PUT', '/messages', { query: { message_id: messageId }, body })
  }

  deleteMessage(messageId) {
    return this.call('DELETE', '/messages', { query: { message_id: messageId } })
  }

  // Ответ на callback: notification — всплывашка-тост; message — заменить исходное сообщение.
  answerCallback(callbackId, { notification, message } = {}) {
    const body = {}
    if (notification != null) body.notification = notification
    if (message != null) body.message = message
    return this.call('POST', '/answers', { query: { callback_id: callbackId }, body })
  }

  // Long-polling. marker — указатель из прошлого ответа (null/undefined для первого).
  getUpdates({ marker, timeout = 30, limit, types } = {}) {
    const query = { timeout }
    if (marker != null) query.marker = marker
    if (limit != null) query.limit = limit
    if (types) query.types = Array.isArray(types) ? types.join(',') : types
    return this.call('GET', '/updates', { query })
  }

  // Инфо о видео по token из входящего VideoAttachment → ссылки на mp4 в .urls.
  getVideo(videoToken) {
    return this.call('GET', `/videos/${encodeURIComponent(videoToken)}`)
  }

  // Скачать байты файла по прямому URL вложения (с авторизацией). Для фото/файла/аудио.
  async download(url) {
    const res = await this.fetchImpl(url, { headers: { Authorization: this.token } })
    if (!res.ok) throw Object.assign(new Error('max_download_failed'), { status: res.status })
    return Buffer.from(await res.arrayBuffer())
  }
}
