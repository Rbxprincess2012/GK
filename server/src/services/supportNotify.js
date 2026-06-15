import { getSetting } from './settings.js'
import { getDriverBotToken } from './botConfig.js'
import { tgSend } from './clientDelivery.js'

// Уведомление суперпользователя в личку Telegram, когда ИИ-ассистент не нашёл ответа —
// чтобы оперативно отреагировать (ответить человеку / дополнить базу знаний). chat_id берётся
// из реквизитов организации (org.support_chat_id), отправка — водительским ботом (внутренний).
// Тихий no-op, если не настроено; ошибки глотаем — ответ пользователю это не блокирует.
export async function notifySupport(text, { sendImpl = tgSend, fetchImpl } = {}) {
  try {
    const org = await getSetting('org')
    const chatId = org?.support_chat_id
    if (!chatId) return { sent: false, reason: 'no_chat' }
    const token = await getDriverBotToken()
    if (!token) return { sent: false, reason: 'no_token' }
    const out = await sendImpl(token, String(chatId), text, fetchImpl)
    return { sent: !!out?.ok, reason: out?.ok ? 'ok' : 'send_failed' }
  } catch {
    return { sent: false, reason: 'error' }
  }
}
