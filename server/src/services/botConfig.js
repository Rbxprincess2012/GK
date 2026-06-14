import { getTokens, getSetting } from './settings.js'
import { config } from '../config.js'
import { MaxApi } from '../lib/maxApi.js'

// Токен водительского бота: ПРИОРИТЕТ — Настройки (БД, admin), затем .env как фолбэк.
// Так токен конфигурится в админке (и под будущий SaaS — пер-тенант), без правки .env на сервере.
export async function getDriverBotToken() {
  const t = await getTokens()
  return t?.telegram_driver_bot_token || config.DRIVER_BOT_TOKEN || null
}

// Токен клиентского бота (отправка отчётов): ПРИОРИТЕТ — Настройки (БД), затем .env.
export async function getClientBotToken() {
  const t = await getTokens()
  return t?.telegram_client_bot_token || config.CLIENT_BOT_TOKEN || null
}

// Username клиентского бота для личных ссылок t.me/<username>?start=<code>.
let cachedClientUsername = null
export async function getClientBotUsername(token = null) {
  if (cachedClientUsername) return cachedClientUsername
  const stored = await getSetting('client_bot_username')
  if (stored?.username) { cachedClientUsername = stored.username; return stored.username }
  const tk = token || (await getClientBotToken())
  if (tk) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tk}/getMe`)
      const data = await res.json()
      if (data?.result?.username) { cachedClientUsername = data.result.username; return cachedClientUsername }
    } catch { /* сеть недоступна — фолбэк ниже */ }
  }
  return config.CLIENT_BOT_USERNAME || null
}

// Username бота для ссылок t.me/<username>?start=<code>.
// Приоритет: сохранённое в Настройках (бот пишет его при старте) → getMe(токен) → .env.
// Так API строит ссылку из БД, не обращаясь к Telegram (важно при перехвате TLS/блокировках).
let cachedUsername = null
export async function getDriverBotUsername(token = null) {
  if (cachedUsername) return cachedUsername
  const stored = await getSetting('driver_bot_username')
  if (stored?.username) { cachedUsername = stored.username; return stored.username }
  const tk = token || (await getDriverBotToken())
  if (tk) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tk}/getMe`)
      const data = await res.json()
      if (data?.result?.username) { cachedUsername = data.result.username; return cachedUsername }
    } catch { /* сеть недоступна — падаем на фолбэк ниже */ }
  }
  return config.DRIVER_BOT_USERNAME || null
}

// ── MAX-боты (зеркало Telegram). Два отдельных бота: водительский и клиентский. ──
// Водительский токен: новый ключ Настроек `max_driver_bot_token`, фолбэк на ранее внесённый
// одиночный `max_bot_token` (заказчик внёс именно водительский), затем .env.
export async function getMaxDriverBotToken() {
  const t = await getTokens()
  return t?.max_driver_bot_token || t?.max_bot_token || config.MAX_DRIVER_BOT_TOKEN || null
}
export async function getMaxClientBotToken() {
  const t = await getTokens()
  return t?.max_client_bot_token || config.MAX_CLIENT_BOT_TOKEN || null
}

// username MAX-ботов для deep-link https://max.ru/<username>?start=<payload>. Приоритет:
// Настройки (бот пишет при старте) → getMe(токен) → .env. Отдельные кеши на каждого бота.
let cachedMaxDriverUsername = null
export async function getMaxDriverBotUsername(token = null) {
  if (cachedMaxDriverUsername) return cachedMaxDriverUsername
  const stored = await getSetting('max_driver_bot_username')
  if (stored?.username) { cachedMaxDriverUsername = stored.username; return stored.username }
  const tk = token || (await getMaxDriverBotToken())
  if (tk) {
    try {
      const me = await new MaxApi(tk).getMe()
      if (me?.username) { cachedMaxDriverUsername = me.username; return me.username }
    } catch { /* сеть недоступна — фолбэк ниже */ }
  }
  return config.MAX_DRIVER_BOT_USERNAME || null
}

let cachedMaxClientUsername = null
export async function getMaxClientBotUsername(token = null) {
  if (cachedMaxClientUsername) return cachedMaxClientUsername
  const stored = await getSetting('max_client_bot_username')
  if (stored?.username) { cachedMaxClientUsername = stored.username; return stored.username }
  const tk = token || (await getMaxClientBotToken())
  if (tk) {
    try {
      const me = await new MaxApi(tk).getMe()
      if (me?.username) { cachedMaxClientUsername = me.username; return me.username }
    } catch { /* сеть недоступна — фолбэк ниже */ }
  }
  return config.MAX_CLIENT_BOT_USERNAME || null
}
