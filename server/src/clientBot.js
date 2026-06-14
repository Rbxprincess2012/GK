import { createClientBot } from './bot/clientBot.js'
import { getClientBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'
import { waitForToken } from './bot/waitToken.js'

// Отдельный процесс клиентского бота (онбординг получателей; single-instance, long-polling).
// Токен — из Настроек админки (БД), .env как фолбэк. Нет токена — ждём (не падаем).
const token = await waitForToken(getClientBotToken, 'client-bot')

const bot = createClientBot(token)
bot.catch((err) => console.error('[client-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('client_bot_username', { username: me.username }).catch(() => {})
    console.log(`[client-bot] @${me.username} запущен (long-polling)`)
  },
})
