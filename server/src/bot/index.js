import { Bot, InlineKeyboard, session } from 'grammy'
import { db } from '../db.js'
import { config } from '../config.js'
import { pgStorage } from './sessionStore.js'
import { bindByCode, resolveDriverByChat } from '../services/driverAuth.js'
import { goOnShift, finishShift } from '../services/driverShift.js'
import { shiftGreeting, shiftFarewell, startGreeting } from './greetings.js'
import { ordersForDriver, orderCardForDriver } from '../services/driverScope.js'
import { markSubtask, commitOrderByDriver } from '../services/subtasks.js'
import { putFromTelegram } from '../services/mediaStore.js'

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
const dmOf = (s) => { const [, m, d] = s.split('-'); return `${d}.${m}` } // yyyy-mm-dd → дд.мм
const vehLabel = (v) => (v ? `${v.model ? `${v.model} · ` : ''}${v.gov_number || '—'}` : '—') // модель · госномер
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function isOnShift(driverId) {
  const row = await db('shifts').where({ driver_id: driverId, date: today(), status: 'present' }).whereNull('odometer_end').first()
  return !!row
}

// ── Рендер заявки: заголовок (объект/участок/адрес-ссылка) + позиции + команда на базу ──
function orderText(order) {
  // Адрес: улица, дом, корпус. «ул.» не дублируем, если уже в названии.
  const street = order.street_name
    ? (/^[а-яё]{1,6}\.\s/i.test(order.street_name) ? order.street_name : `ул. ${order.street_name}`)
    : null
  const addr = [
    order.city,
    street,
    order.object_house && `д. ${order.object_house}`,
    order.object_building && `к. ${order.object_building}`,
  ].filter(Boolean).join(', ') || order.address_raw || '—'
  // Кликабельный адрес: при наличии координат — точка на карте, иначе — поиск по тексту адреса
  // (чтобы ссылка работала, даже если геокодер не определил координаты объекта).
  const map = (order.lat != null && order.lng != null)
    ? `https://yandex.ru/maps/?ll=${order.lng},${order.lat}&z=17&pt=${order.lng},${order.lat}`
    : (addr !== '—' ? `https://yandex.ru/maps/?text=${encodeURIComponent(addr)}` : null)
  const addrLine = map ? `📍 <a href="${map}">${esc(addr)}</a>` : `📍 ${esc(addr)}`
  const sections = [...new Set((order.items || []).map((it) => it.section_name).filter(Boolean))]
  // Заявка ещё не отправлена в работу (предпросмотр на завтра/дату) — помечаем явно.
  const notInWork = order.status && !['in_progress', 'done', 'closed'].includes(order.status)
  // Желаемое время заезда: пусто → «как можно быстрее», иначе конкретный час.
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
  // Доверенное лицо (создаётся на уровне Клиента/ГК): 👤 ФИО + 📞 телефон в одну строку.
  // Привязка: нет участков → лицо на объект (section_id=null), показываем один раз под объектом;
  // есть участки → лицо привязано к участку и печатается под КАЖДЫМ участком. Одно и то же лицо
  // на нескольких участках намеренно дублируем — так проще в коде и нагляднее водителю.
  const sc = order.section_contacts || []
  const fmtContact = (c) => {
    const name = c.name ? `👤 ${esc(c.name)}` : ''
    const phone = c.phone ? `📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''
    return [name, phone].filter(Boolean).join(' · ')
  }
  const objLevel = sc.filter((c) => c.section_id == null)        // лицо «на весь объект» (объект без участков)
  const ownFor = (sid) => sc.filter((c) => c.section_id === sid) // лица именно этого участка
  // Под участком — его лицо(а); для позиции без участка ничего (объектное лицо идёт под объектом).
  const contactSuffix = (it) => it.section_id == null ? ''
    : ownFor(it.section_id).map(fmtContact).filter(Boolean).map((s) => `\n${s}`).join('')
  // Навальный вывоз (грейфер/газель/самосвал) — контейнеров нет, объём = число ходок.
  const BULK = { grapple: 'Грейфер', gazelle: 'Газель', samosval: 'Самосвал' }
  const isBulk = order.service_type && order.service_type !== 'container'
  let work, base, trips
  if (isBulk) {
    const runs = Math.max(1, Number(order.grapple_runs) || 1)
    const label = BULK[order.service_type] || 'Вывоз навалом'
    work = `🚛 ${label} — вывоз навалом${runs > 1 ? `\n🔁 ${runs} ходок` : ''}`
    base = ''; trips = ''
  } else {
    // Каждый участок — отдельным блоком: «📍 Участок: действие N · №…» + контакт под ним.
    // Блоки разделяем пустой строкой; над ними — заголовок «Задание водителю …».
    const hasSections = (order.items || []).some((it) => it.section_name)
    const blocks = (order.items || []).map((it) =>
      `${it.section_name ? '📍 ' : '• '}${it.section_name ? `${esc(it.section_name)}: ` : ''}${ACTION[it.action] || it.action} ${it.quantity}`
      + (it.container_numbers ? ` · №${esc(it.container_numbers)}` : '')
      + contactSuffix(it))
    const header = hasSections ? 'Задание водителю по участкам 📍:' : 'Задание водителю:'
    work = blocks.length ? `${header}\n${blocks.join('\n\n')}` : 'Позиции не указаны'
    const E = Number(order.empties) || 0
    base = E > 0 ? `\n\nС базы взять: ${'📦'.repeat(Math.min(E, 6))}${E > 6 ? `×${E}` : ''}` : ''
    trips = Number(order.trips) > 1 ? `\n🔁 ${order.trips} рейса` : ''
  }
  // Оплата наличными — показываем явно (водителю нужно взять деньги); с суммой, если задана.
  const cash = order.payment_method === 'cash'
    ? `\n\n💵 Оплата НАЛИЧНЫМИ${order.amount != null ? `: ${Number(order.amount)} ₽` : ''}`
    : ''
  // Лицо под объектом (один раз): объект без участков → лицо на объект; если привязок нет вовсе —
  // лицо уровня заявки. При участках контакты идут под участками, объектной строки нет.
  let contact = ''
  const objStr = objLevel.map(fmtContact).filter(Boolean).join('\n')
  if (objStr) contact = `\n\n${objStr}`
  else if (!sc.length && (order.trusted_person_name || order.trusted_person_phone))
    contact = `\n\n${fmtContact({ name: order.trusted_person_name, phone: order.trusted_person_phone })}`
  // Возвращённые менеджером на переделку участки — что переснять.
  const rework = (order.subtasks || []).filter((s) => s.proof_status === 'rejected' && s.status === 'pending')
  const reworkBlock = rework.length
    ? '\n\n' + rework.map((s) =>
      `↩️ Переснять${s.section_name ? ` «${esc(s.section_name)}»` : ''}${s.review_comment ? `: ${esc(s.review_comment)}` : ''}`).join('\n')
    : ''
  return `${head}${contact}\n\n${work}${base}${cash}${trips}${reworkBlock}`
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
  if (onShift) kb.text('🏁 Завершить смену', 'fin')
  else kb.text('🚐 Вышел на смену', 'shift')
  return kb
}

// Кол-во заявок (выездов) водителя по датам в диапазоне — для подписи на кнопках.
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

// Сетка дат: 2 недели вперёд по 3 в ряд, с числом выездов (Пн 15.07 (8) → day:YYYY-MM-DD).
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

// greeting — необязательное приветствие/прощание по имени; уходит ОДНИМ сообщением вместе
// со строкой статуса и клавиатурой (а не отдельным reply), чтобы не плодить два сообщения.
async function sendMenu(ctx, greeting = '') {
  ctx.session.nav = ['menu'] // меню — корень навигации
  const onShift = await isOnShift(ctx.session.driverId)
  let veh = ''
  if (onShift) {
    const sh = await db('shifts as s').leftJoin('vehicles as v', 'v.id', 's.vehicle_id')
      .where({ 's.driver_id': ctx.session.driverId, 's.date': today(), 's.status': 'present' }).whereNull('s.odometer_end')
      .select('v.gov_number', 'v.model').first()
    if (sh?.gov_number) veh = `\n🚐 ${vehLabel(sh)}`
  }
  const status = onShift ? `✅ Вы на смене.${veh}` : '⬜ Вы не на смене.'
  await ctx.reply(greeting ? `${greeting}\n\n${status}` : status, { reply_markup: menuKeyboard(onShift) })
}

async function sendOrderCard(ctx, orderId, onShift = true) {
  const order = await orderCardForDriver(orderId, ctx.session.driverId)
  if (!order) return ctx.reply('Заявка недоступна.')
  // Вне смены — только просмотр: карточку показываем без кнопок действий (П1).
  await ctx.reply(orderText(order), {
    parse_mode: 'HTML',
    reply_markup: onShift ? orderKeyboard(order) : undefined,
    link_preview_options: { is_disabled: true },
  })
}

// ── Навигация: чистая перерисовка экрана. НЕ меняет статусы заявок и не запускает действия. ──
async function renderScreen(ctx, token) {
  ctx.session.step = null // любая навигация отменяет незавершённый ввод (пробег/пруф)
  const driverId = ctx.session.driverId
  if (token === 'menu') return sendMenu(ctx)
  if (token === 'tasks') {
    const orders = await ordersForDriver(driverId, { date: today(), statuses: ['in_progress'] })
    if (!orders.length) return ctx.reply('Заявок в работе пока нет. Менеджер ещё не отправил их в работу.')
    const onShift = await isOnShift(driverId)
    if (!onShift) await ctx.reply('⬜ Вы не на смене — сейчас только просмотр. Выйдите на смену в меню, чтобы отмечать работу.')
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

// Перейти на экран с записью в стек навигации (без дублей подряд).
async function showScreen(ctx, token) {
  const nav = ctx.session.nav || (ctx.session.nav = [])
  if (nav[nav.length - 1] !== token) nav.push(token)
  await renderScreen(ctx, token)
}

// Шаг назад: снять текущий экран и перерисовать предыдущий (корень — меню).
async function goBack(ctx) {
  const nav = ctx.session.nav || (ctx.session.nav = [])
  nav.pop()
  const target = nav[nav.length - 1] || 'menu'
  await renderScreen(ctx, target)
}

// Начать сбор пруфа (можно несколько файлов/текстов) — общий для «выполнено» и «не смог».
// Требует ли объект заявки фотоотчёт. Флаг ≠ false (вкл. null) = «Необходим» —
// так же, как показано менеджеру в карточке/модалке объекта.
async function objectRequiresPhoto(orderId) {
  const row = await db('orders as o').join('objects as ob', 'ob.id', 'o.object_id')
    .where('o.id', orderId).select('ob.requires_photo as rp').first()
  return !!row && row.rp !== false
}

// mode: 'done' — по «Готово» помечаем участок выполненным; 'failed' — уже помечен, пруф опционален.
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

async function ingestProof(message, { orderId, subtaskId, driverId }) {
  let kind, fileId = null, transcript = null
  if (message.photo) { kind = 'photo'; fileId = message.photo.at(-1).file_id }
  else if (message.video) { kind = 'video'; fileId = message.video.file_id }
  else if (message.voice) { kind = 'audio'; fileId = message.voice.file_id }
  else if (message.text) { kind = 'text'; transcript = message.text }
  else return false
  const [att] = await db('attachments')
    .insert({ order_id: orderId, subtask_id: subtaskId, kind, tg_file_id: fileId, transcript, author_driver_id: driverId })
    .returning('*')
  if (fileId) {
    // фон: скачиваем в своё хранилище, дописываем file_url (коммит не блокируем)
    putFromTelegram(fileId).then((url) => db('attachments').where({ id: att.id }).update({ file_url: url })).catch(() => {})
  }
  return true
}

const navRows = () => ([
  [{ text: '↩️ Шаг назад', callback_data: 'back' }],
  [{ text: '⬅️ Главное меню', callback_data: 'menu' }],
])

// Если в тексте больше одного предложения — переносим каждое на новую строку (после . ! ?).
// Срабатывает только на простых подсказках (не на HTML-карточках), сокращения «ул.»/«д.»
// не задеваются: перенос лишь там, где после точки и пробела идёт заглавная буква.
function splitSentences(text) {
  return text.replace(/([.!?])\s+(?=[А-ЯЁA-Z])/g, '$1\n')
}

export function createBot(token = config.DRIVER_BOT_TOKEN) {
  const bot = new Bot(token)

  // На любом сообщении — кнопки «Шаг назад» + «Главное меню». Само меню (содержит «Выйти»)
  // пропускаем, чтобы не дублировать; повторно тоже не добавляем.
  bot.api.config.use((prev, method, payload, signal) => {
    if (method === 'sendMessage') {
      // Читабельность: многопредложные простые подсказки — по строке на предложение.
      if (!payload.parse_mode && typeof payload.text === 'string') payload.text = splitSentences(payload.text)
      const rm = payload.reply_markup
      const rows = rm && Array.isArray(rm.inline_keyboard) ? rm.inline_keyboard : null
      const hasNav = rows?.some((r) => r.some((b) => ['menu', 'logout', 'back'].includes(b.callback_data)))
      if (!hasNav) {
        if (rows) rows.push(...navRows())
        else payload.reply_markup = { inline_keyboard: navRows() }
      }
    }
    return prev(method, payload, signal)
  })

  bot.use(session({
    initial: () => ({ driverId: null, authed: false, step: null, data: {}, nav: [] }),
    storage: pgStorage,
    getSessionKey: (ctx) => (ctx.chat?.id != null ? String(ctx.chat.id) : undefined),
  }))

  // ── /start: привязка по коду из ссылки, либо узнаём по chat_id ──
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id
    const code = (ctx.match || '').trim()
    if (code) {
      try {
        const ch = await bindByCode(code, chatId)
        ctx.session.driverId = Number(ch.owner_id); ctx.session.authed = true; ctx.session.step = null
        const drv = await db('drivers').where({ id: ctx.session.driverId }).first()
        await ctx.reply(`${drv?.first_name || drv?.name || 'Водитель'}, приветствую! Вы привязаны к боту.`)
        return sendMenu(ctx)
      } catch {
        return ctx.reply('Ссылка недействительна или истекла. Попросите менеджера сгенерировать новую.')
      }
    }
    // Без кода: узнаём по chat_id (привязка постоянная) — пароль не нужен.
    const drv = await resolveDriverByChat(chatId)
    if (!drv) return ctx.reply('Вы ещё не привязаны. Откройте личную ссылку, которую дал менеджер.')
    ctx.session.driverId = drv.id; ctx.session.authed = true; ctx.session.step = null
    const onShift = await isOnShift(drv.id)
    return sendMenu(ctx, onShift ? '' : startGreeting(drv.first_name || drv.name))
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
      // Кнопка-заглушка: выход намеренно отключён (не разлогиниваем водителя).
      return ctx.reply('Этот раздел пока в разработке.')
    }
    if (data === 'shift') {
      // Сначала выбор машины, потом пробег.
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
    // ── ниже — действия по заявке (меняют статусы), не навигация ──
    // Вне смены — только просмотр: любое действие по заявке требует «на смене» (П1).
    if (data === 'pdone' || /^(sd|sf|sr|oc):/.test(data)) {
      if (!(await isOnShift(driverId))) {
        return ctx.reply('Вы не на смене — сейчас только просмотр. Выйдите на смену в меню, чтобы отмечать работу.')
      }
    }
    // sd:<subId>:<orderId> — отметить выполнено (сбор пруфа, можно несколько)
    if (data.startsWith('sd:')) {
      const [, subId, orderId] = data.split(':')
      return startProof(ctx, { subtaskId: Number(subId), orderId: Number(orderId), mode: 'done' })
    }
    // pdone — завершить сбор пруфа
    if (data === 'pdone') {
      const d = ctx.session.data || {}
      if (d.mode === 'done' && !d.count) return ctx.reply('Нужен хотя бы один пруф: фото / видео / голос или текст.')
      // Боевой фотоотчёт: участок нельзя закрыть без фото, если объект его требует.
      // Сессию НЕ сбрасываем — водитель досылает фото и снова жмёт «Готово».
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
    // sf:<subId>:<orderId> — не смог → выбрать причину
    if (data.startsWith('sf:')) {
      const [, subId, orderId] = data.split(':')
      const kb = new InlineKeyboard()
      for (const [c, label] of REASONS) kb.text(label, `sr:${subId}:${orderId}:${c}`).row()
      return ctx.reply('Причина:', { reply_markup: kb })
    }
    // sr:<subId>:<orderId>:<code> — причина выбрана
    if (data.startsWith('sr:')) {
      const [, subId, orderId, code] = data.split(':')
      // «Другое» — даём водителю описать причину своими словами (одним сообщением),
      // затем предложим приложить фото. Текст станет комментарием к участку (его увидит менеджер).
      if (code === 'other') {
        ctx.session.step = 'fail_reason'
        ctx.session.data = { subtaskId: Number(subId), orderId: Number(orderId) }
        return ctx.reply('Опишите, что произошло — одним сообщением (фото можно добавить следующим шагом):')
      }
      try {
        await markSubtask(Number(subId), { status: 'failed', reason_code: code, comment: reasonLabel(code), driverId })
      } catch {
        return ctx.reply('Эта заявка уже не за вами или закрыта — отметить нельзя.')
      }
      await ctx.reply(`Отмечено: не выполнено (${reasonLabel(code)}).`)
      return startProof(ctx, { subtaskId: Number(subId), orderId: Number(orderId), mode: 'failed' })
    }
    // oc:<orderId> — завершить заявку (коммит)
    if (data.startsWith('oc:')) {
      const [, orderId] = data.split(':')
      // Нельзя завершить, пока по каждому участку не отмечено «выполнено» или «не смог» (П1).
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
      return sendMenu(ctx, shiftGreeting(drv?.first_name || drv?.name))
    }
    if (step === 'odo_end') {
      const km = parseInt(text, 10)
      if (!Number.isFinite(km)) return ctx.reply('Введите число (км):')
      try { await finishShift(driverId, { date: today(), odometerEnd: km }) }
      catch { return ctx.reply('Вы не на смене.') }
      ctx.session.step = null
      const drvEnd = await db('drivers').where({ id: driverId }).first()
      return sendMenu(ctx, shiftFarewell(drvEnd?.first_name || drvEnd?.name))
    }
    // «Другое»: первое сообщение — текст причины (комментарий участка); затем переходим к пруфу.
    if (step === 'fail_reason') {
      const d = ctx.session.data || {}
      const comment = text || '✍️ Другое'
      try {
        await markSubtask(Number(d.subtaskId), { status: 'failed', reason_code: 'other', comment, driverId })
      } catch {
        ctx.session.step = null
        return ctx.reply('Эта заявка уже не за вами или закрыта — отметить нельзя.')
      }
      await ctx.reply('Отмечено: не выполнено. Причина записана.')
      await startProof(ctx, { subtaskId: Number(d.subtaskId), orderId: Number(d.orderId), mode: 'failed' })
      // Если вместо текста пришло фото/видео/голос — сразу примем это как первый пруф.
      if (!text) {
        const ok = await ingestProof(ctx.message, { orderId: d.orderId, subtaskId: d.subtaskId, driverId })
        if (ok) { const dd = ctx.session.data; dd.count = 1; if (ctx.message.photo) dd.photoCount = 1; ctx.session.data = dd }
      }
      return
    }
    if (step === 'proof') {
      const d = ctx.session.data || {}
      const ok = await ingestProof(ctx.message, { orderId: d.orderId, subtaskId: d.subtaskId, driverId })
      if (!ok) return ctx.reply('Пришлите фото / видео / голосовое или текст.')
      d.count = (d.count || 0) + 1
      if (ctx.message.photo) d.photoCount = (d.photoCount || 0) + 1
      ctx.session.data = d
      const needPhoto = d.photoRequired && !d.photoCount
      const kb = new InlineKeyboard().text('✅ Готово', 'pdone')
      const tail = needPhoto ? ' 📷 Нужно ещё фото — заказчик требует фотоотчёт.' : ''
      return ctx.reply(`Принято (${d.count}).${tail} Пришлите ещё фото/текст или нажмите «Готово».`, { reply_markup: kb })
    }

    // вне шага и не авторизован — пробуем распознать код привязки в тексте
    // (водитель часто вставляет ссылку/код вместо тапа по deep-link).
    if (!ctx.session.authed) {
      const m = text && text.match(/(\d{6})/)
      if (m) {
        try {
          const ch = await bindByCode(m[1], ctx.chat.id)
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
