import { readSession, writeSession, deleteSession } from '../services/botSession.js'

// Адаптер хранилища grammY/maxgram-session поверх Postgres (bot_sessions). Ключ — chat_id,
// канал зашит в фабрику (чтобы Telegram и MAX не делили одну строку сессии).
export const pgStorageFor = (channel) => ({
  read: (key) => readSession(channel, Number(key)),
  write: (key, value) => writeSession(channel, Number(key), value),
  delete: (key) => deleteSession(channel, Number(key)),
})

// Обратная совместимость: текущий Telegram-бот импортирует pgStorage без указания канала.
export const pgStorage = pgStorageFor('telegram')
