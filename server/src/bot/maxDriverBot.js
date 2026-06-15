import { Bot, InlineKeyboard, session } from '../lib/maxgram.js'
import { db } from '../db.js'
import { pgStorageFor } from './sessionStore.js'
import { bindByCode, resolveDriverByChat } from '../services/driverAuth.js'
import { goOnShift, finishShift } from '../services/driverShift.js'
import { shiftGreeting } from './greetings.js'
import { ordersForDriver, orderCardForDriver } from '../services/driverScope.js'
import { markSubtask, commitOrderByDriver } from '../services/subtasks.js'
import { putFromMax } from '../services/mediaStore.js'

// Водительский MAX-бот — зеркало bot/index.js на maxgram. Бизнес-логика (сервисы) общая,
// channel='max'. Отличия от Telegram: медиа из MAX-вложений (putFromMax), nav-кнопки через
// beforeSend, presentation в format:'html'. Сессии — pgStorageFor('max').
const CHANNEL = 'max'

// Стрелки действий — зеркало иконок админки (ContainerJob.jsx): → установить, ⇄ заменить, ← забрать.
const ACTION = { place: '→ Установить', replace: '⇄ Заменить', haul: '← Забрать' }
const REASONS = [
  ['dig', '🚧 Перекопано/нет проезда'],
  ['mud', '🛻 Не подъехать (грязь)'],
  ['full', '🗑 Контейнер переполнен'],
  ['noacc', '🔒 Нет доступа'],
  ['canc', '✋ Клиент отменил'],
  ['other', '✍️ Другое'],
]
const reasonLabel = (c) => (REASONS.find((r) => r[0] === c)?.[1] || c)

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => ymd(new Date())
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d) }
const dmOf = (s) => { const [, m, d] = s.split('-'); return `${d}.${m}` }
const vehLabel = (v) => (v ? `${v.model ? `${v.model} · ` : ''}${v.gov_number || '—'}` : '—')
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function isOnShift(driverId) {
  const row = await db('shifts').where({ driver_id: driverId, date: today(), status: 'present' }).whereNull('odometer_end').first()
  return !!row
}

// ── Рендер заявки (идентично Telegram-боту) ──
function orderText(order) {
  const street = order.street_name
    ? (/^[а-яё]{1,6}\.\s/i.test(order.street_name) ? order.street_name : `ул. ${order.street_name}`)
    : null
  const addr = [
    order.city, street,
    order.object_house && `д. ${order.object_house}`,
    order.object_building && `к. ${order.object_building}`,
  ].filter(Boolean).join(', ') || order.address_raw || '—'
  // Кликабельный адрес: координаты → точка на карте, иначе → поиск по тексту адреса.
  const map = (order.lat != null && order.lng != null)
    ? `https://yandex.ru/maps/?ll=${order.lng},${order.lat}&z=17&pt=${order.lng},${order.lat}`
    : (addr !== '—' ? `https://yandex.ru/maps/?text=${encodeURIComponent(addr)}` : null)
  const addrLine = map ? `📍 <a href="${map}">${esc(addr)}</a>` : `📍 ${esc(addr)}`
  const sections = [...new Set((order.items || []).map((it) => it.section_name).filter(Boolean))]
  const notInWork = order.status && !['in_progress', 'done', 'closed'].includes(order.status)
  const timeLine = order.desired_time
    ? `🕐 К ${String(order.desired_time).slice(0, 5)}`
    : '⚡ Как можно быстрее'
  const head = [
    `<b>Заявка №${order.number ?? '—'}</b>`,
    notInWork ? '🕓 Ещё не в работе' : null,
    order.object_name ? esc(order.object_name) : null,
    sections.length ? `Участок: ${sections.map(esc).join(', ')}` : null,
    addrLine,
    timeLine,
  ].filter(Boolean).join('\n')
  const sc = order.section_contacts || []
  const fmtContact = (c) => {
    const name = c.name ? `👤 ${esc(c.name)}` : ''
    const phone = c.phone ? `📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''
    return [name, phone].filter(Boolean).join(' · ')
  }
  const objLevel = sc.filter((c) => c.section_id == null)
  const ownFor = (sid) => sc.filter((c) => c.section_id === sid)
  const contactSuffix = (it) => it.section_id == null ? ''
    : ownFor(it.section_id).map(fmtContact).filter(Boolean).map((s) => `\n   ${s}`).join('')
  const lines = (order.items || []).map((it) =>
    `• ${it.section_name ? `${esc(it.section_name)} — ` : ''}${ACTION[it.action] || it.action} ${it.quantity}`
    + (it.container_numbers ? ` · №${esc(it.container_numbers)}` : '')
    + contactSuffix(it))
  if (!lines.length) lines.push('• позиции не указаны')
  const E = Number(order.empties) || 0
  const base = E > 0 ? `\n\nС базы взять: ${'📦'.repeat(Math.min(E, 6))}${E > 6 ? `×${E}` : ''}` : ''
  const trips = Number(order.trips) > 1 ? `\n🔁 ${order.trips} рейса` : ''
  const cash = order.payment_method === 'cash'
    ? `\n\n💵 Оплата НАЛИЧНЫМИ${order.amount != null ? `: ${Number(order.amount)} ₽` : ''}`
    : ''
  let contact = ''
  const objStr = objLevel.map(fmtContact).filter(Boolean).join('\n')
  if (objStr) contact = `\n\n${objStr}`
  else if (!sc.length && (order.trusted_person_name || order.trusted_person_phone))
    contact = `\n\n${fmtContact({ name: order.trusted_person_name, phone: order.trusted_person_phone })}`
  const rework = (order.subtasks || []).filter((s) => s.proof_status === 'rejected' && s.status === 'pending')
  const reworkBlock = rework.length
    ? '\n\n' + rework.map((s) =>
      `↩️ Переснять${s.section_name ? ` «${esc(s.section_name)}»` : ''}${s.review_comment ? `: ${esc(s.review_comment)}` : ''}`).join('\n')
    : ''
  return `${head}${contact}\n\n${lines.join('\n')}${base}${cash}${trips}${reworkBlock}`
}

function orderKeyboard(order) {
  const kb = new InlineKeyboard()
  for (const st of order.subtasks || []) {
    const label = st.section_name ? `Уч. ${st.section_name}` : 'Объект'
    if (st.status === 'done') kb.text(`✅ ${label}`, 'noop').row()
    else if (st.status === 'failed') kb.text(`⚠️ ${label} — не смог`, 'noop').row()
    else kb.text(`✅ ${label}`, `sd:${st.id}:${order.id}`).text('⚠️', `sf:${st.id}:${order.id}`).row()
  }
  kb.text('🏁 Завершить заявку', `oc:${order.id}`)
  return kb
}

function menuKeyboard(onShift) {
  const kb = new InlineKeyboard()
  kb.text(`📋 Задачи на сегодня (${dmOf(today())})`, 'tasks').row()
  kb.text(`🗓 Задачи на завтра (${dmOf(tomorrow())})`, 'tomorrow').row()
  kb.text('📅 Задачи на дату…', 'datepick').row()
  if (onShift) kb.text('🏁 Завершить смену', 'fin').row()
  else kb.text('🚐 Вышел на смену', 'shift').row()
  kb.text('🚪 Выйти', 'logout')
  return kb
}

async function tripCountsByDate(driverId, from, to) {
  const rows = await db('orders')
    .where({ assigned_driver_id: driverId })
    .whereNotNull('shift_date')
    .whereBetween('shift_date', [from, to])
    .whereNot('status', 'cancelled')
    .groupByRaw("to_char(shift_date,'YYYY-MM-DD')")
    .select(db.raw("to_char(shift_date,'YYYY-MM-DD') as d")).count({ n: '*' })
  const map = {}
  for (const r of rows) map[r.d] = Number(r.n)
  return map
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
async function dateGridKeyboard(driverId, days = 14) {
  const base = new Date(); base.setHours(0, 0, 0, 0)
  const end = new Date(base); end.setDate(base.getDate() + days - 1)
  const counts = await tripCountsByDate(driverId, ymd(base), ymd(end))
  const kb = new InlineKeyboard()
  for (let i = 0; i < days; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i)
    const s = ymd(d)
    const n = counts[s] || 0
    kb.text(`${WD[d.getDay()]} ${dmOf(s)}${n ? ` (${n})` : ''}`, `day:${s}`)
    if (i % 3 === 2) kb.row()
  }
  return kb
}

async function sendMenu(ctx) {
  ctx.session.nav = ['menu']
  const onShift = await isOnShift(ctx.session.driverId)
  let veh = ''
  if (onShift) {
    const sh = await db('shifts as s').leftJoin('vehicles as v', 'v.id', 's.vehicle_id')
      .where({ 's.driver_id': ctx.session.driverId, 's.date': today(), 's.status': 'present' }).whereNull('s.odometer_end')
      .select('v.gov_number', 'v.model').first()
    if (sh?.gov_number) veh = `\n🚐 ${vehLabel(sh)}`
  }
  await ctx.reply(onShift ? `🟢 Вы на смене.${veh}` : '⚪ Вы не на смене.', { reply_markup: menuKeyboard(onShift) })
}

async function sendOrderCard(ctx, orderId, onShift = true) {
  const order = await orderCardForDriver(orderId, ctx.session.driverId)
  if (!order) return ctx.reply('Заявка недоступна.')
  await ctx.reply(orderText(order), {
    parse_mode: 'HTML',
    reply_markup: onShift ? orderKeyboard(order) : undefined,
    link_preview_options: { is_disabled: true },
  })
}

async function renderScreen(ctx, token) {
  ctx.session.step = null
  const driverId = ctx.session.driverId
  if (token === 'menu') return sendMenu(ctx)
  if (token === 'tasks') {
    const orders = await ordersForDriver(driverId, { date: today(), statuses: ['in_progress'] })
    if (!orders.length) return ctx.reply('Заявок в работе пока нет. Менеджер ещё не отправил их в работу.')
    const onShift = await isOnShift(driverId)
    if (!onShift) await ctx.reply('⚪ Вы не на смене — сейчас только просмотр. Выйдите на смену в меню, чтобы отмечать работу.')
    for (const o of orders) await sendOrderCard(ctx, o.id, onShift)
    return
  }
  if (token === 'tomorrow') {
    const orders = await ordersForDriver(driverId, { date: tomorrow(), statuses: ['assigned', 'review', 'in_progress'] })
    if (!orders.length) return ctx.reply('На завтра заявок пока нет.')
    await ctx.reply(`🗓 Задачи на завтра (${dmOf(tomorrow())}) — предпросмотр:`)
    for (const o of orders) {
      const order = await orderCardForDriver(o.id, driverId)
      if (order) await ctx.reply(orderText(order), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
    }
    return
  }
  if (token === 'datepick') {
    return ctx.reply('📅 Выберите дату:', { reply_markup: await dateGridKeyboard(driverId) })
  }
  if (token.startsWith('day:')) {
    const date = token.slice(4)
    const orders = await ordersForDriver(driverId, { date })
    if (!orders.length) return ctx.reply(`На ${dmOf(date)} заявок нет.`)
    await ctx.reply(`🗓 Задачи на ${dmOf(date)}:`)
    const onShift = date === today() ? await isOnShift(driverId) : false
    for (const o of orders) {
      if (o.status === 'in_progress') await sendOrderCard(ctx, o.id, onShift)
      else {
        const order = await orderCardForDriver(o.id, driverId)
        if (order) await ctx.reply(orderText(order), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
      }
    }
    return
  }
}

async function showScreen(ctx, token) {
  const nav = ctx.session.nav || (ctx.session.nav = [])
  if (nav[nav.length - 1] !== token) nav.push(token)
  await renderScreen(ctx, token)
}

async function goBack(ctx) {
  const nav = ctx.session.nav || (ctx.session.nav = [])
  nav.pop()
  const target = nav[nav.length - 1] || 'menu'
  await renderScreen(ctx, target)
}

async function objectRequiresPhoto(orderId) {
  const row = await db('orders as o').join('objects as ob', 'ob.id', 'o.object_id')
    .where('o.id', orderId).select('ob.requires_photo as rp').first()
  return !!row && row.rp !== false
}

async function startProof(ctx, { subtaskId, orderId, mode }) {
  ctx.session.step = 'proof'
  const photoRequired = mode === 'done' ? await objectRequiresPhoto(orderId) : false
  ctx.session.data = { subtaskId, orderId, mode, count: 0, photoCount: 0, photoRequired }
  const kb = new InlineKeyboard().text('✅ Готово', 'pdone')
  const prompt = mode === 'done'
    ? (photoRequired
        ? '📷 По этому объекту обязателен фотоотчёт: приложите минимум одно ФОТО (можно дополнить видео/голосом/текстом). Материалы попадут в отчёт заказчику — снимайте аккуратно. Затем «Готово».'
        : 'Приложите подтверждение работы: фото / видео / голосовое или текст. Эти материалы попадут в отчёт заказчику — снимайте аккуратно и комментируйте по делу. Можно несколько, затем «Готово».')
    : 'По желанию приложите подтверждение, почему не вышло: фото / видео / голосовое или текст. Это тоже увидит заказчик — формулируйте корректно. Можно несколько, затем «Готово».'
  return ctx.reply(prompt, { reply_markup: kb })
}

// Приёмка пруфа из MAX-сообщения: текст + вложения (image/video/audio/file). Возвращает счётчики.
// Медиа качаем в своё хранилище в фоне (putFromMax), коммит не блокируем.
const MAX_KIND = { image: 'photo', video: 'video', audio: 'audio' }
async function ingestProof(message, { orderId, subtaskId, driverId }) {
  let count = 0, photoCount = 0
  if (message.text) {
    await db('attachments').insert({ order_id: orderId, subtask_id: subtaskId, kind: 'text', transcript: message.text, author_driver_id: driverId })
    count++
  }
  for (const a of message.attachments || []) {
    const kind = MAX_KIND[a.type] || 'file'
    const [att] = await db('attachments')
      .insert({ order_id: orderId, subtask_id: subtaskId, kind, tg_file_id: a.token || null, author_driver_id: driverId })
      .returning('*')
    putFromMax(a).then((url) => db('attachments').where({ id: att.id }).update({ file_url: url })).catch(() => {})
    count++
    if (a.type === 'image') photoCount++
  }
  return { count, photoCount }
}

// ── nav-кнопки (Шаг назад / Главное меню) на исходящие, кроме экранов с собственной навигацией ──
const NAV_IDS = ['menu', 'logout', 'back']
function kbRows(kb) {
  if (!kb) return []
  if (kb instanceof InlineKeyboard) return kb.toButtons()
  if (Array.isArray(kb.inline_keyboard)) return kb.inline_keyboard.map((r) => r.map((b) => ({ text: b.text, payload: String(b.callback_data ?? b.payload) })))
  if (kb.type === 'inline_keyboard') return kb.payload.buttons
  return []
}
function withNav(kb) {
  const out = new InlineKeyboard()
  out.rows = []
  for (const row of kbRows(kb)) out.rows.push(row.map((b) => ({ type: 'callback', text: b.text, payload: String(b.payload) })))
  out.rows.push([{ type: 'callback', text: '↩️ Шаг назад', payload: 'back' }])
  out.rows.push([{ type: 'callback', text: '⬅️ Главное меню', payload: 'menu' }])
  return out
}
function splitSentences(text) {
  return text.replace(/([.!?])\s+(?=[А-ЯЁA-Z])/g, '$1\n')
}

export function createMaxDriverBot(token) {
  const bot = new Bot(token)

  // Многопредложные простые подсказки — по строке на предложение; nav-кнопки, если их ещё нет.
  bot.beforeSend((payload) => {
    if (!payload.format && typeof payload.text === 'string') payload.text = splitSentences(payload.text)
    const hasNav = kbRows(payload.keyboard).some((r) => r.some((b) => NAV_IDS.includes(b.payload)))
    if (!hasNav) payload.keyboard = withNav(payload.keyboard)
  })

  bot.use(session({
    initial: () => ({ driverId: null, authed: false, step: null, data: {}, nav: [] }),
    storage: pgStorageFor(CHANNEL),
    getSessionKey: (ctx) => (ctx.chat?.id != null ? String(ctx.chat.id) : undefined),
  }))

  // ── /start (bot_started payload или typed): привязка по коду, либо узнаём по chat_id ──
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id
    const code = (ctx.match || '').trim()
    if (code) {
      try {
        const ch = await bindByCode(code, chatId, CHANNEL)
        ctx.session.driverId = Number(ch.owner_id); ctx.session.authed = true; ctx.session.step = null
        const drv = await db('drivers').where({ id: ctx.session.driverId }).first()
        await ctx.reply(`${drv?.first_name || drv?.name || 'Водитель'}, приветствую! Вы привязаны к боту.`)
        return sendMenu(ctx)
      } catch {
        return ctx.reply('Ссылка недействительна или истекла. Попросите менеджера сгенерировать новую.')
      }
    }
    const drv = await resolveDriverByChat(chatId, CHANNEL)
    if (!drv) return ctx.reply('Вы ещё не привязаны. Откройте личную ссылку, которую дал менеджер.')
    ctx.session.driverId = drv.id; ctx.session.authed = true; ctx.session.step = null
    return sendMenu(ctx)
  })

  // ── Callback-кнопки ──
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    await ctx.answerCallbackQuery().catch(() => {})
    if (data === 'noop') return
    if (data === 'menu') {
      if (!ctx.session.authed) return ctx.reply('Сначала войдите: /start')
      return sendMenu(ctx)
    }
    if (!ctx.session.authed) return ctx.reply('Сначала войдите: /start')
    const driverId = ctx.session.driverId

    if (data === 'logout') {
      ctx.session.authed = false; ctx.session.step = null
      return ctx.reply('Вы вышли. Чтобы вернуться — отправьте /start.')
    }
    if (data === 'shift') {
      const vehicles = await db('vehicles').where({ status: 'active' }).orderBy('gov_number')
      if (!vehicles.length) return ctx.reply('Нет доступных машин. Обратитесь к менеджеру.')
      const drv = await db('drivers').where({ id: driverId }).first()
      const kb = new InlineKeyboard()
      for (const v of vehicles) {
        const star = v.id === drv?.default_vehicle_id ? '⭐ ' : ''
        kb.text(`${star}${vehLabel(v)}`, `veh:${v.id}`).row()
      }
      return ctx.reply('🚐 Выберите машину для смены:', { reply_markup: kb })
    }
    if (data.startsWith('veh:')) {
      const vehicleId = Number(data.slice(4))
      const v = await db('vehicles').where({ id: vehicleId }).first()
      ctx.session.data = { vehicleId }; ctx.session.step = 'odo_start'
      return ctx.reply(`Машина: ${vehLabel(v)}. Теперь введите пробег на старте смены (км):`)
    }
    if (data === 'fin') { ctx.session.step = 'odo_end'; return ctx.reply('Введите пробег в конце смены (км):') }
    if (data === 'back') return goBack(ctx)
    if (data === 'tasks') return showScreen(ctx, 'tasks')
    if (data === 'tomorrow') return showScreen(ctx, 'tomorrow')
    if (data === 'datepick') return showScreen(ctx, 'datepick')
    if (data.startsWith('day:')) return showScreen(ctx, data)
    // Вне смены — только просмотр: любое действие по заявке требует «на смене».
    if (data === 'pdone' || /^(sd|sf|sr|oc):/.test(data)) {
      if (!(await isOnShift(driverId))) {
        return ctx.reply('Вы не на смене — сейчас только просмотр. Выйдите на смену в меню, чтобы отмечать работу.')
      }
    }
    if (data.startsWith('sd:')) {
      const [, subId, orderId] = data.split(':')
      return startProof(ctx, { subtaskId: Number(subId), orderId: Number(orderId), mode: 'done' })
    }
    if (data === 'pdone') {
      const d = ctx.session.data || {}
      if (d.mode === 'done' && !d.count) return ctx.reply('Нужен хотя бы один пруф: фото / видео / голос или текст.')
      if (d.mode === 'done' && d.photoRequired && !d.photoCount) {
        return ctx.reply('📷 По этому объекту обязателен фотоотчёт — приложите хотя бы одно фото, затем «Готово».')
      }
      ctx.session.step = null
      if (d.mode === 'done') {
        try {
          await markSubtask(Number(d.subtaskId), { status: 'done', driverId })
        } catch (e) {
          if (e?.status === 422) { ctx.session.step = 'proof'; return ctx.reply('📷 По этому объекту обязателен фотоотчёт — приложите фото и нажмите «Готово».') }
          return ctx.reply('Эта заявка уже не за вами или закрыта — отметить нельзя.')
        }
        await ctx.reply(`✅ Участок отмечен выполненным (пруфов: ${d.count}).`)
      } else {
        await ctx.reply(d.count ? `Подтверждение сохранено (${d.count}).` : 'Ок.')
      }
      return sendOrderCard(ctx, Number(d.orderId))
    }
    if (data.startsWith('sf:')) {
      const [, subId, orderId] = data.split(':')
      const kb = new InlineKeyboard()
      for (const [c, label] of REASONS) kb.text(label, `sr:${subId}:${orderId}:${c}`).row()
      return ctx.reply('Причина:', { reply_markup: kb })
    }
    if (data.startsWith('sr:')) {
      const [, subId, orderId, code] = data.split(':')
      try {
        await markSubtask(Number(subId), { status: 'failed', reason_code: code, comment: reasonLabel(code), driverId })
      } catch {
        return ctx.reply('Эта заявка уже не за вами или закрыта — отметить нельзя.')
      }
      await ctx.reply(`Отмечено: не выполнено (${reasonLabel(code)}).`)
      return startProof(ctx, { subtaskId: Number(subId), orderId: Number(orderId), mode: 'failed' })
    }
    if (data.startsWith('oc:')) {
      const [, orderId] = data.split(':')
      const pending = await db('order_subtasks as st')
        .leftJoin('sections as s', 's.id', 'st.section_id')
        .where({ 'st.order_id': Number(orderId), 'st.status': 'pending' })
        .select('s.name as section_name')
      if (pending.length) {
        const names = pending.map((p) => (p.section_name ? `«${p.section_name}»` : 'участок')).join(', ')
        return ctx.reply(`Сначала отметьте по каждому участку «✅ выполнено» или «⚠️ не смог». Осталось: ${names}.`)
      }
      try {
        const res = await commitOrderByDriver(Number(orderId), driverId)
        if (res.already) return ctx.reply('Заявка уже отправлена менеджеру.')
        return ctx.reply(res.all_done
          ? '✅ Работа по заявке отправлена менеджеру на подтверждение. Спасибо!'
          : '✅ Выполненные участки отправлены менеджеру на подтверждение. Невыполненные передали на ручную обработку. Спасибо!')
      } catch (e) {
        return ctx.reply(e?.status === 403 ? 'Заявка уже не за вами.' : 'Не удалось завершить заявку.')
      }
    }
  })

  // ── Текст/медиа: шаги ввода (пробег, пруф) ──
  bot.on('message', async (ctx) => {
    const step = ctx.session.step
    const driverId = ctx.session.driverId
    const text = ctx.message.text?.trim()

    if (step === 'odo_start') {
      const km = parseInt(text, 10)
      if (!Number.isFinite(km)) return ctx.reply('Введите число (км):')
      await goOnShift(driverId, { date: today(), vehicleId: ctx.session.data?.vehicleId ?? null, odometerStart: km })
      ctx.session.step = null
      const drv = await db('drivers').where({ id: driverId }).first()
      await ctx.reply(shiftGreeting(drv?.first_name || drv?.name))
      return sendMenu(ctx)
    }
    if (step === 'odo_end') {
      const km = parseInt(text, 10)
      if (!Number.isFinite(km)) return ctx.reply('Введите число (км):')
      try { await finishShift(driverId, { date: today(), odometerEnd: km }) }
      catch { return ctx.reply('Вы не на смене.') }
      ctx.session.step = null; await ctx.reply('🏁 Смена завершена. Хорошего отдыха!'); return sendMenu(ctx)
    }
    if (step === 'proof') {
      const d = ctx.session.data || {}
      const added = await ingestProof(ctx.message, { orderId: d.orderId, subtaskId: d.subtaskId, driverId })
      if (!added.count) return ctx.reply('Пришлите фото / видео / голосовое или текст.')
      d.count = (d.count || 0) + added.count
      d.photoCount = (d.photoCount || 0) + added.photoCount
      ctx.session.data = d
      const needPhoto = d.photoRequired && !d.photoCount
      const kb = new InlineKeyboard().text('✅ Готово', 'pdone')
      const tail = needPhoto ? ' 📷 Нужно ещё фото — заказчик требует фотоотчёт.' : ''
      return ctx.reply(`Принято (${d.count}).${tail} Пришлите ещё фото/текст или нажмите «Готово».`, { reply_markup: kb })
    }

    // вне шага и не авторизован — пробуем распознать код привязки в тексте
    if (!ctx.session.authed) {
      const m = text && text.match(/(\d{6})/)
      if (m) {
        try {
          const ch = await bindByCode(m[1], ctx.chat.id, CHANNEL)
          ctx.session.driverId = Number(ch.owner_id); ctx.session.authed = true; ctx.session.step = null
          const drv = await db('drivers').where({ id: ctx.session.driverId }).first()
          await ctx.reply(`${drv?.first_name || drv?.name || 'Водитель'}, приветствую! Вы привязаны к боту.`)
          return sendMenu(ctx)
        } catch { return ctx.reply('Код недействителен или истёк. Попросите менеджера новую ссылку.') }
      }
      return ctx.reply('Войдите: /start — или пришлите ссылку/код привязки от менеджера.')
    }
    return sendMenu(ctx)
  })

  return bot
}
