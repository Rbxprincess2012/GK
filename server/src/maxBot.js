import { createMaxDriverBot } from './bot/maxDriverBot.js'
import { getMaxDriverBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'

// Отдельный процесс водительского MAX-бота (single-instance, long-polling).
// Токен из Настроек админки (БД), .env — фолбэк.
const token = await getMaxDriverBotToken()
if (!token) {
  console.error('[max-driver-bot] Токен не задан. Внесите его в админке: Настройки → «Водительский MAX-бот».')
  process.exit(1)
}

const bot = createMaxDriverBot(token)
bot.catch((err) => console.error('[max-driver-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('max_driver_bot_username', { username: me?.username }).catch(() => {})
    console.log(`[max-driver-bot] @${me?.username || '?'} запущен (long-polling)`)
  },
})
