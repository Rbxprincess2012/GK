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

// Nominatim (OpenStreetMap): бесплатно, без ключа. Для объектов используем
// структурированный запрос (city+street) — он жёстко держит город и точнее.
async function nominatimGeocode(input) {
  const p = new URLSearchParams({ format: 'json', limit: '1', 'accept-language': 'ru' })
  if (typeof input === 'string') {
    p.set('q', input)
  } else {
    p.set('country', 'Россия')
    if (input.city) p.set('city', input.city)
    const street = [input.house, input.street].filter(Boolean).join(' ')
    if (street) p.set('street', street)
  }
  const data = await getJson(`https://nominatim.openstreetmap.org/search?${p.toString()}`,
    { 'User-Agent': 'Putevo/1.0 (dispatcher geocoding)' })
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit) return null
  const lat = Number(hit.lat), lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, source: 'nominatim', precision: hit.type || null }
}

async function resolveProvider() {
  const dist = await getSetting('distribution').catch(() => null)
  if (dist?.geocoder === 'yandex' || dist?.geocoder === 'nominatim') return dist.geocoder
  const tokens = await getTokens().catch(() => ({}))
  return (tokens.yandex_geocoder_key || process.env.YANDEX_GEOCODER_KEY) ? 'yandex' : 'nominatim'
}

// Главная точка входа. Возвращает {lat,lng,source,precision} | null.
export async function geocode(input) {
  if (!input || (typeof input === 'string' && !input.trim())) return null
  const provider = await resolveProvider()
  try {
    if (provider === 'yandex') {
      const tokens = await getTokens().catch(() => ({}))
      const key = tokens.yandex_geocoder_key || process.env.YANDEX_GEOCODER_KEY
      if (key) return await yandexGeocode(input, key)
    }
    return await nominatimGeocode(input)
  } catch (e) {
    console.error(`[geocode:${provider}] ошибка:`, e.message)
    return null
  }
}

// Доп. регион-префикс для объектов (например «Краснодарский край») — из настроек.
export async function regionPrefix() {
  const d = await getSetting('distribution').catch(() => null)
  return d?.region || ''
}
