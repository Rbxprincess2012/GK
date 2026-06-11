import { db } from '../db.js'
import { getClientBotToken } from './botConfig.js'

// Отправка сообщения клиентским ботом напрямую через Telegram HTTP API.
// Вызывается из api (не из бот-процесса). На сервере api контейнер с IPv4-пином к
// api.telegram.org, поэтому отправка проходит из РФ.
export async function tgSend(token, chatId, text, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.json()
}

// Разослать готовый текст отчёта всем active-получателям клиента заявки.
// Возвращает { sent, failed, recipients }. Сетевые ошибки/403 копятся в failed, цикл не падает.
export async function sendReportToClient(orderId, { body, token, fetchImpl } = {}, conn = db) {
  const order = await conn('orders').where({ id: orderId }).first()
  if (!order) return { sent: 0, failed: 0, recipients: 0 }
  const recips = await conn('client_recipients').where({ client_id: order.client_id, status: 'active' })
  if (!recips.length) return { sent: 0, failed: 0, recipients: 0 }
  const tk = token || (await getClientBotToken())
  let sent = 0, failed = 0
  for (const r of recips) {
    try {
      const out = await tgSend(tk, r.chat_id, body, fetchImpl)
      if (out?.ok) { sent++; await conn('client_recipients').where({ id: r.id }).update({ last_sent_at: conn.fn.now() }) }
      else failed++
    } catch { failed++ }
  }
  return { sent, failed, recipients: recips.length }
}
