import { createMaxDriverBot } from './bot/maxDriverBot.js'
import { getMaxDriverBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'
import { waitForToken } from './bot/waitToken.js'

// Отдельный процесс водительского MAX-бота (single-instance, long-polling).
// Токен из Настроек админки (БД), .env — фолбэк. Нет токена — ждём (не падаем).
const token = await waitForToken(getMaxDriverBotToken, 'max-driver-bot')

const bot = createMaxDriverBot(token)
bot.catch((err) => console.error('[max-driver-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('max_driver_bot_username', { username: me?.username }).catch(() => {})
    console.log(`[max-driver-bot] @${me?.username || '?'} запущен (long-polling)`)
  },
})
