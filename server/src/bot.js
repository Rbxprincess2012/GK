import { createBot } from './bot/index.js'
import { getDriverBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'
import { waitForToken } from './bot/waitToken.js'

// Отдельный процесс водительского бота (single-instance, long-polling).
// Токен берём из Настроек админки (БД), .env — опциональный фолбэк. Нет токена — ждём (не падаем).
const token = await waitForToken(getDriverBotToken, 'driver-bot')

const bot = createBot(token)
bot.catch((err) => console.error('[driver-bot] error:', err))
bot.start({
  onStart: async (me) => {
    // Сохраняем username в Настройки — чтобы API строил ссылки привязки без обращения к Telegram.
    await setSetting('driver_bot_username', { username: me.username }).catch(() => {})
    console.log(`[driver-bot] @${me.username} запущен (long-polling)`)
  },
})
