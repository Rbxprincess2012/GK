import { db } from '../db.js'
import { getClientBotToken, getMaxClientBotToken } from './botConfig.js'
import { MaxApi } from '../lib/maxApi.js'
import { activePersonsForObject } from './trustedPersonChannels.js'

// Отправка сообщения клиентским ботом напрямую через HTTP API мессенджера. Вызывается из api
// (не из бот-процесса). Telegram: IPv4-пин к api.telegram.org. MAX: platform-api.max.ru (РФ-хост).
export async function tgSend(token, chatId, text, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.json()
}

// Отправка через MAX. chat_id у MAX-получателя получен при онбординге (bot_started.chat_id).
export async function maxSend(token, chatId, text, fetchImpl = fetch) {
  return new MaxApi(token, { fetchImpl }).sendMessage({ chatId }, { text })
}

// Чат заблокирован / удалён: Telegram отдаёт error_code, MAX — HTTP status. И то и другое 403/400.
const isBlocked = (out) => [403, 400].includes(out?.error_code) || [403, 400].includes(out?.status)

// Разослать готовый текст отчёта получателям заявки по их каналам (Telegram/MAX):
//  • active-получатели КЛИЕНТА (личные чаты/группы), канал — в строке client_recipients.channel;
//  • active доверенные ЛИЦА объекта — по каждому активному каналу лица (tg И/ИЛИ max).
// Возвращает { sent, failed, recipients }. Сетевые ошибки/блок копятся в failed, цикл не падает.
export async function sendReportToClient(orderId, { body, token, fetchImpl } = {}, conn = db) {
  const order = await conn('orders').where({ id: orderId }).first()
  if (!order) return { sent: 0, failed: 0, recipients: 0 }
  const recips = await conn('client_recipients').where({ client_id: order.client_id, status: 'active' })
  const persons = await activePersonsForObject(order.object_id, conn)
  const targets = []
  for (const r of recips) {
    targets.push({ kind: 'client', channel: r.channel || 'telegram', id: r.id, chat_id: r.chat_id })
  }
  for (const p of persons) {
    if (p.tg_status === 'active' && p.tg_chat_id != null) targets.push({ kind: 'person', channel: 'telegram', id: p.id, chat_id: p.tg_chat_id })
    if (p.max_status === 'active' && p.max_chat_id != null) targets.push({ kind: 'person', channel: 'max', id: p.id, chat_id: p.max_chat_id })
  }
  if (!targets.length) return { sent: 0, failed: 0, recipients: 0 }

  // Токены по каналам — лениво. Telegram уважает явный override `token` (легаси-контракт/тесты).
  let tgTk, maxTk
  const tokenFor = async (channel) => {
    if (channel === 'max') { if (maxTk === undefined) maxTk = await getMaxClientBotToken(); return maxTk }
    if (tgTk === undefined) tgTk = token ?? (await getClientBotToken())
    return tgTk
  }

  let sent = 0, failed = 0
  for (const t of targets) {
    try {
      const tk = await tokenFor(t.channel)
      const out = t.channel === 'max'
        ? await maxSend(tk, t.chat_id, body, fetchImpl)
        : await tgSend(tk, t.chat_id, body, fetchImpl)
      if (out?.ok) {
        sent++
        if (t.kind === 'client') await conn('client_recipients').where({ id: t.id }).update({ last_sent_at: conn.fn.now() })
      } else {
        failed++
        // Бот заблокирован / чат удалён → деактивируем ИМЕННО этот канал, чтобы менеджер видел
        // проблему и заново онбордил, а не молча терял будущие отчёты.
        if (isBlocked(out)) {
          if (t.kind === 'client') await conn('client_recipients').where({ id: t.id }).update({ status: 'revoked', updated_at: conn.fn.now() })
          else await conn('trusted_persons').where({ id: t.id }).update({ [`${t.channel === 'max' ? 'max' : 'tg'}_status`]: 'revoked' })
        }
      }
    } catch { failed++ }
  }
  return { sent, failed, recipients: targets.length }
}
