import { db } from '../db.js'
import { getClientBotToken } from './botConfig.js'
import { activePersonsForObject } from './trustedPersonChannels.js'

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

// Разослать готовый текст отчёта получателям заявки:
//  • active-получатели КЛИЕНТА (личные чаты/группы — онбординг бота);
//  • active доверенные ЛИЦА, привязанные к объекту заявки (личный онбординг).
// Возвращает { sent, failed, recipients }. Сетевые ошибки/403 копятся в failed, цикл не падает.
export async function sendReportToClient(orderId, { body, token, fetchImpl } = {}, conn = db) {
  const order = await conn('orders').where({ id: orderId }).first()
  if (!order) return { sent: 0, failed: 0, recipients: 0 }
  const recips = await conn('client_recipients').where({ client_id: order.client_id, status: 'active' })
  const persons = await activePersonsForObject(order.object_id, conn)
  const targets = [
    ...recips.map((r) => ({ kind: 'client', id: r.id, chat_id: r.chat_id })),
    ...persons.map((p) => ({ kind: 'person', id: p.id, chat_id: p.tg_chat_id })),
  ]
  if (!targets.length) return { sent: 0, failed: 0, recipients: 0 }
  const tk = token || (await getClientBotToken())
  let sent = 0, failed = 0
  for (const t of targets) {
    try {
      const out = await tgSend(tk, t.chat_id, body, fetchImpl)
      if (out?.ok) {
        sent++
        if (t.kind === 'client') await conn('client_recipients').where({ id: t.id }).update({ last_sent_at: conn.fn.now() })
      } else failed++
    } catch { failed++ }
  }
  return { sent, failed, recipients: targets.length }
}
