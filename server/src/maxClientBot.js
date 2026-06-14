import { createMaxClientBot } from './bot/maxClientBot.js'
import { getMaxClientBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'
import { waitForToken } from './bot/waitToken.js'

// Отдельный процесс клиентского MAX-бота (онбординг получателей; single-instance, long-polling).
// Токен — из Настроек админки (БД), .env как фолбэк. Если токена ещё нет — ждём (не падаем),
// чтобы контейнер не рестарт-лупил и сам поднялся после внесения токена в админке.
const token = await waitForToken(getMaxClientBotToken, 'max-client-bot')

const bot = createMaxClientBot(token)
bot.catch((err) => console.error('[max-client-bot] error:', err))
bot.start({
  onStart: async (me) => {
    await setSetting('max_client_bot_username', { username: me.username }).catch(() => {})
    console.log(`[max-client-bot] @${me?.username || '?'} запущен (long-polling)`)
  },
})
