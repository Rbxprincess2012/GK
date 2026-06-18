import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { enqueue } from './outbox.js'
import { config } from '../config.js'
import { getSetting } from './settings.js'
import { sendReportToClient, tgSend, maxSend } from './clientDelivery.js'
import { getClientBotToken, getMaxClientBotToken } from './botConfig.js'
import { activePersonsForObject } from './trustedPersonChannels.js'
import { carryOverSubtaskTx } from './subtasks.js'

const BASE_URL = config.APP_URL || 'https://putevo.su'

// ── Чистые функции (без БД) ──

// Неугадываемый токен публичного отчёта (24 hex-символа).
export function buildReportToken() {
  return randomUUID().replace(/-/g, '').slice(0, 24)
}

export function reportUrl(token) { return `${BASE_URL}/r/${token}` }

// Подстановка плейсхолдеров {key}. Неизвестные/пустые — оставляем как есть.
export function renderTemplate(body, vars) {
  return String(body || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
}

// Диплинк в личный чат по номеру. Telegram по номеру ?text= НЕ подставляет — текст копируется отдельно.
export function buildDeepLink(phone, messenger = 'telegram') {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const intl = digits.startsWith('8') ? '7' + digits.slice(1) : digits
  if (messenger === 'max') return `https://max.ru/u/+${intl}`
  return `https://t.me/+${intl}`
}

// ── Сборка сообщения и приёмка (с БД) ──

const DEFAULT_BODY = [
  'Здравствуйте, уважаемые партнёры!',
  '',
  'Заявка №{number} от {date} — {status}',
  '',
  'Заказчик: {client}',
  'Объект: {address}',
  'Водитель: {driver}',
  'Сумма: {amount}',
  '',
  'Информация по участкам:',
  '{sections}',
  '',
  'Отчёт по заявке: {report_url}',
].join('\n')

function fmtDate(d) {
  if (!d) return ''
  const s = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)
  const [y, m, day] = s.split('-')
  return `${day}.${m}.${y}`
}

// Дата+время в МСК (сервер может быть в UTC) — для «время выполнения» по участку.
function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(dt)
}

// Адрес объекта для сообщения клиенту. Собираем из справочника (город+улица+дом) ТОЛЬКО при
// наличии улицы; без street_name (свободный адрес из DaData) берём полный address_raw, иначе
// огрызок «Город, д. N» теряет улицу. Фолбэк — город+дом или неформальное имя.
export function addressOf(o) {
  if (o.street_name) {
    return [o.city, o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`]
      .filter(Boolean).join(', ')
  }
  return o.address_raw
    || [o.city, o.house && `д. ${o.house}`].filter(Boolean).join(', ')
    || o.informal_name || '—'
}

function amountOf(o) {
  if (o.payment_method === 'cash') return `${o.amount != null ? Number(o.amount) : 0} ₽ (наличными)`
  return 'безналичный расчёт'
}

function driverOf(o) {
  if (!o.driver_name) return '—'
  const veh = [o.veh_model, o.veh_gov].filter(Boolean).join(' ')
  return veh ? `${o.driver_name} · ${veh}` : o.driver_name
}

// Под-задачи с именами участков (для отчёта и текста сообщения).
async function sectionRows(orderId, conn) {
  return conn('order_subtasks as st')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .leftJoin('drivers as d', 'd.id', 'st.completed_by_driver_id')
    .where('st.order_id', orderId).orderBy('st.sub_no')
    .select('st.id', 'st.sub_no', 'st.section_id', 'st.status', 'st.reason_code', 'st.comment',
      'st.completed_at', 'st.completed_by_driver_id', 's.name as section_name', 'd.name as done_driver_name')
}

// «Информация по участкам»: выполненные (rows на этой заявке) — 🟢, перенесённые из-за
// невыполнения (carried — ушли в отдельные заявки) — 🔴. 📍 перед каждым участком.
function sectionsText(rows, carried = [], isGrapple = false) {
  const lines = []
  const seen = new Set()
  for (const r of rows) {
    const name = isGrapple ? 'Вывоз навалом' : (r.section_name || 'Объект')
    seen.add(name)
    lines.push(`📍 ${name} — ${r.status === 'done' ? 'выполнено 🟢' : 'выполнить не удалось 🔴'}`)
  }
  for (const c of carried) {
    const name = c.section_name || 'Объект'
    if (seen.has(name)) continue
    lines.push(`📍 ${name} — выполнить не удалось 🔴`)
  }
  return lines.join('\n')
}

// Статус заявки с согласованием рода (заявка — ж.р.): полностью / частично / не выполнена.
function statusLine(rows, carried = []) {
  const total = rows.length + carried.length
  const done = rows.filter((r) => r.status === 'done').length
  if (total === 0 || done === total) return 'выполнена ✅'
  if (done === 0) return 'не выполнена ❌'
  return 'выполнена частично 🟡'
}

// Участки, выделенные из заявки в отдельные «остаточные» заявки (ещё не выполнены) —
// для строки клиенту «передано менеджеру на ручную обработку».
async function carriedOverSections(orderId, conn) {
  return conn('orders as o')
    .leftJoin('order_subtasks as st', 'st.order_id', 'o.id')
    .leftJoin('sections as s', 's.id', 'st.section_id')
    .where('o.split_from_order_id', orderId)
    .whereNotIn('o.status', ['done', 'closed', 'cancelled'])
    .select('s.name as section_name')
}

// Хвост сообщения клиенту: (опц.) строка про невыполненные участки + «ждём следующего заказа».
function messageTail(carried) {
  const tail = []
  if (carried.length) {
    const names = carried.map((c) => (c.section_name ? `«${c.section_name}»` : 'участок')).join(', ')
    tail.push(`⚠️ ${carried.length > 1 ? 'Участки' : 'Участок'} ${names} выполнить не удалось — подробности в Отчёте по заявке. Передали информацию менеджеру на ручную обработку. Перераспределим в ближайшее время или свяжемся с вами отдельно.`)
  }
  tail.push('Ждём вашего следующего заказа! 🚛')
  return tail.join('\n\n')
}

// Заголовочные данные заявки (объект/клиент/водитель/машина) одним запросом.
// where — объект с условием ({ 'o.id': N } или { 'o.public_token': '…' }).
async function orderHead(where, conn) {
  return conn('orders as o')
    .leftJoin('objects as ob', 'ob.id', 'o.object_id')
    .leftJoin('streets as s', 's.id', 'ob.street_id')
    .leftJoin('clients as cl', 'cl.id', 'ob.client_id')
    .leftJoin('drivers as d', 'd.id', 'o.assigned_driver_id')
    .leftJoin('vehicles as v', 'v.id', 'o.vehicle_id')
    .where(where)
    .select(
      'o.*', 'ob.city', 'ob.house', 'ob.building', 'ob.informal_name', 'ob.address_raw', 's.name as street_name',
      'cl.nickname as client_nickname', 'cl.legal_name as client_legal_name',
      'd.name as driver_name', 'v.model as veh_model', 'v.gov_number as veh_gov',
    ).first()
}

async function activeTemplateBody(templateId) {
  const tpls = (await getSetting('client_message_templates')) || []
  const t = templateId ? tpls.find((x) => x.id === templateId) : (tpls.find((x) => x.id === 'report') || tpls[0])
  return t?.body || DEFAULT_BODY
}

// Собрать текст сообщения клиенту по заявке (для админки — превью/копирование).
export async function buildClientMessage(orderId, { templateId, token } = {}, conn = db) {
  const head = await orderHead({ 'o.id': orderId }, conn)
  if (!head) return null
  const rows = await sectionRows(orderId, conn)
  const carried = await carriedOverSections(orderId, conn)
  const tok = token || head.public_token
  const isGrapple = head.service_type && head.service_type !== 'container' // навальный вывоз
  const vars = {
    // Заказчик — официальное юр. наименование (неофициальный ник клиента выпилен из проекта).
    client: head.client_legal_name || `Клиент #${head.id}`,
    number: head.number ?? head.id,
    date: fmtDate(head.desired_date),
    status: statusLine(rows, carried),
    address: addressOf(head),
    driver: driverOf(head),
    sections: sectionsText(rows, carried, isGrapple),
    amount: amountOf(head),
    report_url: tok ? reportUrl(tok) : '',
  }
  const body = renderTemplate(await activeTemplateBody(templateId), vars).trimEnd() + '\n\n' + messageTail(carried)
  const results = rows.map((r) => ({ sub_no: r.sub_no, section_id: r.section_id, status: r.status }))
  return { body, results, vars, head, carried }
}

// Гарантировать public_token у заявки (создать, если ещё нет). Идемпотентно.
// Нужно для ручной отправки клиенту даже по частично выполненной заявке (есть failed-участок),
// где автоприёмка не срабатывает.
export async function ensurePublicToken(orderId, conn = db) {
  const o = await conn('orders').where({ id: orderId }).first()
  if (!o) return null
  if (o.public_token) return o.public_token
  const token = buildReportToken()
  await conn('orders').where({ id: orderId }).update({ public_token: token })
  return token
}

// Хук приёмки заявки: один раз — public_token, событие боту, лог. Идемпотентно по event_key.
export async function onOrderAccepted(orderId, { userId = null, channels = 'outbox', templateId } = {}, conn = db) {
  const order = await conn('orders').where({ id: orderId }).first()
  if (!order) return null
  let token = order.public_token
  if (!token) {
    token = buildReportToken()
    await conn('orders').where({ id: orderId }).update({ public_token: token })
  }
  const msg = await buildClientMessage(orderId, { templateId, token }, conn)
  await enqueue(conn, {
    event_type: 'client_report_ready', order_id: orderId,
    payload: { number: order.number, public_token: token, report_url: reportUrl(token), body: msg.body, results: msg.results },
    event_key: `report:${orderId}`,
  })
  await conn('client_messages').insert({
    order_id: orderId, template: templateId || 'report', body: msg.body, public_token: token,
    sent_by: userId || null, channels,
  })
  return { token, body: msg.body, report_url: reportUrl(token) }
}

// Подтверждение менеджером заявки из 'awaiting_confirmation': → done, все пруфы приняты,
// формируется сообщение клиенту (token + outbox + лог), затем авто-рассылка получателям
// клиента в Telegram. Рассылка — ВНЕ транзакции (HTTP не держит tx). sendImpl инъектируется
// в тестах. Возвращает { token, body, report_url, delivery:{sent,failed,recipients} }.
export async function confirmOrder(orderId, { userId = null, templateId, sendImpl = sendReportToClient } = {}) {
  const acc = await db.transaction(async (trx) => {
    // forUpdate: при гонке (двойной клик) второй запрос ждёт коммита первого, затем видит
    // status='done' и падает в 409 — не будет повторной рассылки отчёта клиенту.
    const order = await trx('orders').where({ id: orderId }).forUpdate().first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    if (order.status !== 'awaiting_confirmation') {
      throw Object.assign(new Error('not_confirmable'), { status: 409 })
    }
    // Невыполненные участки, не разрулённые менеджером вручную, уходят в отдельные
    // новые заявки (= «Оставить в Задачах»). Клиенту про них уйдёт строка в хвосте.
    const leftovers = await trx('order_subtasks').where({ order_id: orderId }).whereNot('status', 'done')
    for (const st of leftovers) await carryOverSubtaskTx(trx, st, order)
    await trx('orders').where({ id: orderId }).update({ status: 'done', done_at: order.done_at || trx.fn.now() })
    await trx('order_subtasks').where({ order_id: orderId })
      .update({ proof_status: 'accepted', reviewed_by: userId || null, reviewed_at: trx.fn.now() })
    return onOrderAccepted(orderId, { userId, channels: 'outbox', templateId }, trx)
  })
  const delivery = await sendImpl(orderId, { body: acc.body })
  return { ...acc, delivery }
}

// ── Уведомление «принято в работу» (прямая отправка, без n8n) ──
// Два шаблона: клиенту (общий чат/группа) и доверенному лицу (по имени). {time_line} —
// планируемое время или «как можно скорее». Шлём напрямую в Telegram/MAX, как отчёт.
const INWORK_CLIENT = [
  'Здравствуйте, уважаемые партнёры!',
  '',
  'Заявка №{number} от {date} принята в работу 🚛',
  'Объект: {address}',
  '',
  'Сообщим, как только водитель выполнит заявку. Спасибо, что выбираете нас!',
].join('\n')

const INWORK_PERSON = [
  'Здравствуйте, {name}!',
  '',
  'Ваша заявка №{number} от {date} принята в работу 🚛',
  'Объект: {address}',
  '',
  'Пришлём отчёт сразу после выполнения.',
].join('\n')

// Имя для обращения: храним «Фамилия Имя» → часть после фамилии (фамилия не нужна).
function firstName(full) {
  const parts = String(full || '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '')
}

// Разослать уведомление «в работу»: клиенту (его получатели) — INWORK_CLIENT; доверенным
// лицам объекта — INWORK_PERSON (с именем). Прямая HTTP-отправка; сетевые ошибки копятся в failed.
export async function sendInWorkNotice(orderId, { fetchImpl } = {}, conn = db) {
  const head = await orderHead({ 'o.id': orderId }, conn)
  if (!head) return { sent: 0, failed: 0 }
  const baseVars = { number: head.number ?? head.id, date: fmtDate(head.desired_date), address: addressOf(head) }
  const clientBody = renderTemplate(INWORK_CLIENT, baseVars)

  const recips = await conn('client_recipients').where({ client_id: head.client_id, status: 'active' })
  const persons = await activePersonsForObject(head.object_id, conn)

  let tgTk, maxTk
  const tokenFor = async (ch) => {
    if (ch === 'max') { if (maxTk === undefined) maxTk = await getMaxClientBotToken(); return maxTk }
    if (tgTk === undefined) tgTk = await getClientBotToken(); return tgTk
  }
  let sent = 0, failed = 0
  const deliver = async (ch, chatId, body) => {
    try {
      const tk = await tokenFor(ch)
      const out = ch === 'max' ? await maxSend(tk, chatId, body, fetchImpl) : await tgSend(tk, chatId, body, fetchImpl)
      out?.ok ? sent++ : failed++
    } catch { failed++ }
  }

  for (const r of recips) await deliver(r.channel || 'telegram', r.chat_id, clientBody)
  for (const p of persons) {
    const body = renderTemplate(INWORK_PERSON, { ...baseVars, name: firstName(p.name) })
    if (p.tg_status === 'active' && p.tg_chat_id != null) await deliver('telegram', p.tg_chat_id, body)
    if (p.max_status === 'active' && p.max_chat_id != null) await deliver('max', p.max_chat_id, body)
  }
  return { sent, failed, recipients: recips.length + persons.length }
}

// Зафиксировать факт ручной отправки менеджером (диплинк скопирован/открыт).
export async function logClientMessage(orderId, { userId = null, body, templateId = null, channels = 'copied' }) {
  const order = await db('orders').where({ id: orderId }).first()
  if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
  const [row] = await db('client_messages').insert({
    order_id: orderId, template: templateId, body, public_token: order.public_token,
    sent_by: userId || null, channels,
  }).returning('*')
  return row
}

// Публичный фотоотчёт по токену (без авторизации). null — если токена нет.
export async function publicReport(token) {
  if (!token) return null
  const head = await orderHead({ 'o.public_token': token }, db)
  if (!head) return null
  const rows = await sectionRows(head.id, db)
  const atts = await db('attachments').where({ order_id: head.id }).orderBy('id')

  // Водитель/авто для отчёта. Обычно из заявки (o.assigned_driver_id). Но если заявка ушла из
  // работы (пул/перенос — назначение снято), берём того, кто реально закрывал участки
  // (order_subtasks.completed_by_driver_id) и его авто по умолчанию.
  let driverName = head.driver_name
  let vehStr = [head.veh_model, head.veh_gov].filter(Boolean).join(' ')
  if (!driverName) {
    const cid = rows.map((r) => r.completed_by_driver_id).find(Boolean)
    if (cid) {
      const d = await db('drivers as d').leftJoin('vehicles as v', 'v.id', 'd.default_vehicle_id')
        .where('d.id', cid).select('d.name', 'v.model as vm', 'v.gov_number as vg').first()
      if (d) {
        driverName = d.name
        if (!vehStr) vehStr = [d.vm, d.vg].filter(Boolean).join(' ')
      }
    }
  }
  const driverLine = driverName ? (vehStr ? `${driverName} · ${vehStr}` : driverName) : '—'

  // Контакты менеджера для клиента (из настроек компании) + есть ли невыполненные участки.
  const org = (await getSetting('org')) || {}
  const manager = (org.manager_name || org.manager_phone)
    ? { name: org.manager_name || '', phone: org.manager_phone || '' }
    : null
  const hasFailed = rows.some((r) => r.status !== 'done')

  return {
    number: head.number ?? head.id,
    client: head.client_legal_name || `Клиент #${head.id}`,
    date: fmtDate(head.desired_date),
    address: addressOf(head),
    driver: driverLine,
    amount: amountOf(head),
    manager,
    has_failed: hasFailed,
    sections: rows.map((r) => {
      const attsFor = atts.filter((a) => a.subtask_id === r.id)
      // Время выполнения: когда участок закрыт, иначе — момент последнего оставленного пруфа.
      const lastAt = attsFor.map((a) => a.created_at).filter(Boolean).sort().at(-1)
      const doneAt = r.completed_at || lastAt || null
      return {
        sub_no: r.sub_no,
        name: r.section_name || 'Объект',
        status: r.status,
        comment: r.comment,
        driver: r.done_driver_name || driverName || null,
        vehicle: vehStr || null,
        time: fmtDateTime(doneAt) || null,
        attachments: attsFor.map((a) => ({
          kind: a.kind, url: a.file_url, transcript: a.transcript,
        })),
      }
    }),
  }
}
