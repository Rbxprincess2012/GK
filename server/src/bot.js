import { createBot } from './bot/index.js'
import { getDriverBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'

// Отдельный процесс водительского бота (single-instance, long-polling).
// Токен берём из Настроек админки (БД), .env — опциональный фолбэк.
const token = await getDriverBotToken()
if (!token) {
  console.error('[driver-bot] Токен не задан. Внесите его в админке: Настройки → «Водительский бот».')
  process.exit(1)
}

const bot = createBot(token)
bot.catch((err) => console.error('[driver-bot] error:', err))
bot.start({
  onStart: async (me) => {
    // Сохраняем username в Настройки — чтобы API строил ссылки привязки без обращения к Telegram.
    await setSetting('driver_bot_username', { username: me.username }).catch(() => {})
    console.log(`[driver-bot] @${me.username} запущен (long-polling)`)
  },
})
