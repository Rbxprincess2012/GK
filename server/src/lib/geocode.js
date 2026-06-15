import https from 'node:https'
import { getTokens, getSetting } from '../services/settings.js'

// Абстракция геокодера: адрес → координаты. Два провайдера:
//   • yandex    — точнее по РФ, но требует ключ и активированный (платный) тариф;
//   • nominatim — OpenStreetMap, бесплатно и без ключа (для «условного» км достаточно).
// Провайдер берётся из настроек (distribution.geocoder); по умолчанию: если есть
// рабочий ключ Яндекса — yandex, иначе nominatim.

// В РФ Яндекс отдаёт сертификат от «Russian Trusted Root CA», которого нет в
// хранилище Node → UNABLE_TO_VERIFY_LEAF_SIGNATURE. Флаг GEOCODER_INSECURE_TLS=1
// разрешает не проверять цепочку (запрос низкочувствительный: адрес → координаты).
const INSECURE = process.env.GEOCODER_INSECURE_TLS === '1' || process.env.GEOCODER_INSECURE_TLS === 'true'
const insecureAgent = INSECURE ? new https.Agent({ rejectUnauthorized: false }) : undefined

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: insecureAgent, headers }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode} ${body.slice(0, 160)}`))
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// Вход может быть строкой (свободный адрес, напр. для базы) ИЛИ структурой
// { city, street, house, building } — для объектов точнее.
function toAddressString(input) {
  if (typeof input === 'string') return input
  return [input.city, [input.street, input.house].filter(Boolean).join(' '), input.building && `к${input.building}`]
    .filter(Boolean).join(', ')
}

// Яндекс Геокодер: https://geocode-maps.yandex.ru/1.x/  (Point.pos = "lng lat")
async function yandexGeocode(input, apikey) {
  const address = toAddressString(input)
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(apikey)}`
    + `&format=json&results=1&lang=ru_RU&geocode=${encodeURIComponent(address)}`
  const data = await getJson(url)
  const obj = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
  if (!obj) return null
  const [lng, lat] = (obj.Point?.pos || '').split(' ').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const precision = obj.metaDataProperty?.GeocoderMetaData?.precision || null
  return { lat, lng, source: 'yandex', precision }
}

// Nominatim (OpenStreetMap): бесплатно, без ключа. Для объектов сначала пробуем
// структурированный запрос (city+street) — он жёстко держит город; если не нашёл —
// фолбэк на свободный запрос q (вся строка адреса + Россия), он спасает нестандартные адреса.
async function nominatimFetchOne(params) {
  const data = await getJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { 'User-Agent': 'Putevo/1.0 (dispatcher geocoding)' })
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit) return null
  const lat = Number(hit.lat), lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, source: 'nominatim', precision: hit.type || null }
}

async function nominatimGeocode(input) {
  if (typeof input !== 'string') {
    const p = new URLSearchParams({ format: 'json', limit: '1', 'accept-language': 'ru', country: 'Россия' })
    if (input.city) p.set('city', input.city)
    const street = [input.house, input.street].filter(Boolean).join(' ')
    if (street) p.set('street', street)
    const structured = await nominatimFetchOne(p)
    if (structured) return structured
  }
  // Фолбэк: свободный запрос всей строкой адреса (для объектов — город+улица+дом).
  const q = (typeof input === 'string' ? input : toAddressString(input)).trim()
  if (!q) return null
  const fq = new URLSearchParams({
    format: 'json', limit: '1', 'accept-language': 'ru',
    q: /росси/i.test(q) ? q : `${q}, Россия`,
  })
  return nominatimFetchOne(fq)
}

async function resolveProvider() {
  const dist = await getSetting('distribution').catch(() => null)
  if (dist?.geocoder === 'yandex' || dist?.geocoder === 'nominatim') return dist.geocoder
  const tokens = await getTokens().catch(() => ({}))
  return (tokens.yandex_geocoder_key || process.env.YANDEX_GEOCODER_KEY) ? 'yandex' : 'nominatim'
}

// Главная точка входа. Возвращает {lat,lng,source,precision} | null.
// Выбранный провайдер пробуется первым; если он вернул null или упал — фолбэк на второй,
// чтобы существующий адрес не оставался без координат из-за капризов одного сервиса.
export async function geocode(input) {
  if (!input || (typeof input === 'string' && !input.trim())) return null
  const provider = await resolveProvider()
  const tokens = await getTokens().catch(() => ({}))
  const key = tokens.yandex_geocoder_key || process.env.YANDEX_GEOCODER_KEY
  const order = provider === 'yandex' ? ['yandex', 'nominatim'] : ['nominatim', 'yandex']
  for (const prov of order) {
    try {
      if (prov === 'yandex') {
        if (!key) continue
        const hit = await yandexGeocode(input, key)
        if (hit) return hit
      } else {
        const hit = await nominatimGeocode(input)
        if (hit) return hit
      }
    } catch (e) {
      console.error(`[geocode:${prov}] ошибка:`, e.message)
    }
  }
  return null
}

// Доп. регион-префикс для объектов (например «Краснодарский край») — из настроек.
export async function regionPrefix() {
  const d = await getSetting('distribution').catch(() => null)
  return d?.region || ''
}
