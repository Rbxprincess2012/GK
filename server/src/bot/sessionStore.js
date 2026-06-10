import { readSession, writeSession, deleteSession } from '../services/botSession.js'

// Адаптер хранилища grammY-session поверх Postgres (bot_sessions). Ключ — chat_id.
export const pgStorage = {
  read: (key) => readSession(Number(key)),
  write: (key, value) => writeSession(Number(key), value),
  delete: (key) => deleteSession(Number(key)),
}
