// Общие ярлыки/хелперы для заявок — единый источник для всех экранов.
export const STATUS = {
  new: ['Новая', 'orange'],
  assigned: ['Назначена', 'purple'],
  review: ['На проверке', 'purple'],
  in_progress: ['В работе', 'green'],
  awaiting_confirmation: ['Ожидает подтверждения', 'purple'],
  done: ['Выполнена', 'green'],
  closed: ['Закрыта', 'purple'],
  cancelled: ['Отменена', 'red'],
}
export const ACTION = { place: 'Установить', replace: 'Заменить', haul: 'Забрать' }
export const ACTIONS = ['place', 'replace', 'haul']

// Что водитель должен сделать с контейнерами на объекте — по правилам машины:
// за рейс ≤2 пустых контейнера ТУДА (вставляются друг в друга) и ≤1 полный ОБРАТНО.
//   E (пустых привезти) = Поставить + Заменить
//   F (полных забрать)  = Заменить + Забрать
//   ходки = max(ceil(E/2), F)
// Берёт данные из o.items (если есть) или из агрегатов o.empties/o.fulls (карточки списков).
export function containerJob(o) {
  let E = 0, F = 0, n = 0
  if (Array.isArray(o?.items) && o.items.length) {
    for (const it of o.items) {
      const q = Number(it.quantity) || 1; n++
      if (it.action === 'place') E += q
      else if (it.action === 'replace') { E += q; F += q }
      else if (it.action === 'haul') F += q
    }
  } else {
    E = Number(o?.empties) || 0
    F = Number(o?.fulls) || 0
    n = E || F ? 1 : 0
  }
  // Заезды: если заявка назначена — берём сохранённое o.trips (по вместимости её машины),
  // иначе оценка по умолчанию (2 пустых за рейс).
  const trips = o?.trips != null ? Number(o.trips) : (n ? Math.max(Math.ceil(E / 2), F, 1) : null)
  return { empties: E, fulls: F, trips, has: n > 0 }
}

// Авто-порядок маршрута водителя (проставляется в seq). Правило:
//   1) районы держим кучно (одной группой, не прыгаем туда-сюда);
//   2) районы с доставками (Поставить/Заменить) идут раньше — водитель стартует
//      с пустыми контейнерами в кузове, логично сразу их разгрузить;
//   3) внутри района: сначала доставки (пустые → объект), потом заборы (порожний рейс);
//   4) при равенстве — по номеру заявки.
export function autoRouteOrder(orders = []) {
  const districtKey = (o) => o?.district_alias || o?.district || 'яяя' // неизвестный район — в конец
  const hasDelivery = (o) => containerJob(o).empties > 0

  // Район «доставочный», если в нём есть хотя бы одна заявка с доставкой пустых.
  const deliveryDistricts = new Set()
  for (const o of orders) if (hasDelivery(o)) deliveryDistricts.add(districtKey(o))

  return [...orders].sort((a, b) => {
    const da = districtKey(a), db = districtKey(b)
    const ra = deliveryDistricts.has(da) ? 0 : 1
    const rb = deliveryDistricts.has(db) ? 0 : 1
    if (ra !== rb) return ra - rb            // доставочные районы раньше
    if (da !== db) return da.localeCompare(db) // районы группой
    const ea = hasDelivery(a) ? 0 : 1
    const eb = hasDelivery(b) ? 0 : 1
    if (ea !== eb) return ea - eb            // внутри района доставки раньше заборов
    return (a.number || 0) - (b.number || 0)
  })
}

// Русское склонение для «рейс/рейса/рейсов» и «контейнер/контейнера/контейнеров».
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function clientName(o) { return o?.client_nickname || o?.client_legal_name || '—' }
// Заказчик — юрлицо (приоритет в карточках водителя ниже улицы/объекта).
export function clientLegal(o) { return o?.client_legal_name || o?.client_nickname || '—' }
// Улица + дом — главное для водителя, выводим первым/сверху.
export function streetLine(o) {
  return [o?.street_name, o?.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ')
    || o?.district_alias || o?.district || '—'
}
// Ссылка на точку объекта в Яндекс.Картах: по координатам (приоритет) или по тексту адреса.
export function yandexMapsUrl(o) {
  const lat = o?.lat, lng = o?.lng
  if (lat != null && lat !== '' && lng != null && lng !== '') {
    return `https://yandex.ru/maps/?ll=${lng},${lat}&z=17&pt=${lng},${lat}`
  }
  const addr = [o?.street_name, o?.object_house && `д. ${o.object_house}`, o?.district].filter(Boolean).join(', ')
  return addr ? `https://yandex.ru/maps/?text=${encodeURIComponent(addr)}` : null
}
// Имя объекта (неформальное), второй по приоритету.
export function objectLine(o) { return o?.object_name || `Объект #${o?.object_id}` }
export function orderTitle(o) {
  return o?.object_name || [o?.street_name, o?.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ') || `Объект #${o?.object_id}`
}
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// ISO-дата 'yyyy-mm-dd' → 'дд.мм.гггг' для показа в тексте (заголовки, подтверждения, пустые состояния).
export function fmtDate(d10) {
  if (!d10) return ''
  const [y, m, d] = String(d10).slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : String(d10)
}

// Желаемое время заезда. Пусто (null/'') → «как можно быстрее»; иначе конкретный часовой слот.
// Слоты — 24 часа (00:00…23:00); формат хранения 'HH:00'.
export const TIME_SLOTS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
export function fmtDesiredTime(t) { return t ? String(t).slice(0, 5) : null }

// Суммарная нагрузка водителя по его заявкам: число, заезды, условный км, интегральный балл.
export function driverLoad(orders = []) {
  let km = 0, trips = 0, score = 0, kmKnown = 0
  for (const o of orders) {
    if (o.distance_km != null) { km += Number(o.distance_km); kmKnown++ }
    if (o.trips != null) trips += Number(o.trips)
    if (o.load_score != null) score += Number(o.load_score)
  }
  return {
    count: orders.length,
    trips,
    km: Math.round(km * 10) / 10,
    score: Math.round(score * 10) / 10,
    kmMissing: orders.length - kmKnown,
  }
}

// Оплата наличными — выделяем ярко на всех этапах (клиент платит наличкой водителю).
export function isCash(o) { return o?.payment_method === 'cash' }
export function fmtMoney(a) {
  if (a == null || a === '') return ''
  const n = Number(a)
  if (Number.isNaN(n)) return ''
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
}
// Единый ярлык нала на всех экранах (П17): «💵 1 500 ₽» или «💵 нал», если сумма не указана.
export function cashLabel(o) { return `💵 ${fmtMoney(o?.amount) || 'нал'}` }
