import { getTokens, getSetting } from './settings.js'
import { config } from '../config.js'

// Токен водительского бота: ПРИОРИТЕТ — Настройки (БД, admin), затем .env как фолбэк.
// Так токен конфигурится в админке (и под будущий SaaS — пер-тенант), без правки .env на сервере.
export async function getDriverBotToken() {
  const t = await getTokens()
  return t?.telegram_driver_bot_token || config.DRIVER_BOT_TOKEN || null
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
