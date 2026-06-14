import { createMaxClientBot } from './bot/maxClientBot.js'
import { getMaxClientBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'

// Отдельный процесс клиентского MAX-бота (онбординг получателей; single-instance, long-polling).
// Токен — из Настроек админки (БД), .env как фолбэк.
const token = await getMaxClientBotToken()
if (!token) {
  console.error('[max-client-bot] Токен не задан. Внесите его в админке: Настройки → «Клиентский MAX-бот».')
  process.exit(1)
}

const bot = createMaxClientBot(token)
bot.catch((err) => console.error('[max-client-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('max_client_bot_username', { username: me.username }).catch(() => {})
    console.log(`[max-client-bot] @${me?.username || '?'} запущен (long-polling)`)
  },
})
