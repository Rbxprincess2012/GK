import { createClientBot } from './bot/clientBot.js'
import { getClientBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'

// Отдельный процесс клиентского бота (онбординг получателей; single-instance, long-polling).
// Токен — из Настроек админки (БД), .env как фолбэк.
const token = await getClientBotToken()
if (!token) {
  console.error('[client-bot] Токен не задан. Внесите его в админке: Настройки → «Клиентский бот».')
  process.exit(1)
}

const bot = createClientBot(token)
bot.catch((err) => console.error('[client-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('client_bot_username', { username: me.username }).catch(() => {})
    console.log(`[client-bot] @${me.username} запущен (long-polling)`)
  },
})
