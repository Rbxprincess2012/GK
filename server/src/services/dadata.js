import { getTokens } from './settings.js'

// DaData «Найти организацию по ИНН/ОГРН» (findById/party). Токен берём из настроек
// (integration_tokens.dadata_token). Прокси на бэке: токен не светится в браузере.
// Бесплатный тариф — до 10 000 запросов/сутки. Банковские реквизиты этот метод НЕ
// возвращает (только юр. данные) — банк/счёт заполняются вручную.
const ENDPOINT = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party'

export async function findPartyByInn(query, fetchImpl = fetch) {
  const tokens = await getTokens()
  const token = tokens.dadata_token
  if (!token) throw Object.assign(new Error('dadata_token_missing'), { status: 400 })
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ query, count: 1 }),
  })
  if (!res.ok) throw Object.assign(new Error('dadata_error'), { status: 502 })
  const json = await res.json()
  const s = json?.suggestions?.[0]
  if (!s) return null
  const d = s.data || {}
  return {
    company_name: d.name?.short_with_opf || d.name?.short || s.value || '',
    short_name: d.name?.short || '', // сокращённое название без ОПФ — для ника клиента
    legal_name: d.name?.full_with_opf || s.value || '',
    inn: d.inn || '',
    kpp: d.kpp || '',
    ogrn: d.ogrn || '',
    // Сокращённый юр. адрес: без почтового индекса и региона (город, улица, дом) —
    // собираем из компонентов DaData; фолбэк на полное значение, если компонентов нет.
    legal_address: shortAddress(d.address),
    legal_address_full: d.address?.unrestricted_value || d.address?.value || '',
    management_name: d.management?.name || '',
    management_post: d.management?.post || '',
  }
}

// Короткий адрес «г Краснодар, ул Красная, д 1» из компонентов DaData (без индекса/региона).
function shortAddress(address) {
  const d = address?.data || {}
  const join = (type, name) => (type && name ? `${type} ${name}` : name || null)
  const parts = [
    join(d.city_type, d.city) || join(d.settlement_type, d.settlement),
    join(d.street_type, d.street),
    join(d.house_type, d.house),
    join(d.block_type, d.block),
  ].filter(Boolean)
  return parts.join(', ') || address?.value || ''
}

// DaData «Подсказки по адресу» (suggest/address) — для ввода адреса объекта в ЛЮБОМ
// городе РФ (вместо справочника улиц Краснодара). Возвращает нормализованный адрес +
// координаты (geo_lat/geo_lon, по ФИАС/ГАР) + район города — всё одним запросом.
// Тот же токен и бесплатный тариф (10k/сутки).
const SUGGEST_ADDRESS = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'

export async function suggestAddress(query, fetchImpl = fetch) {
  const tokens = await getTokens()
  const token = tokens.dadata_token
  if (!token) throw Object.assign(new Error('dadata_token_missing'), { status: 400 })
  const res = await fetchImpl(SUGGEST_ADDRESS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ query, count: 7 }),
  })
  if (!res.ok) throw Object.assign(new Error('dadata_error'), { status: 502 })
  const json = await res.json()
  return (json?.suggestions || []).map((s) => {
    const d = s.data || {}
    const lat = d.geo_lat != null ? Number(d.geo_lat) : null
    const lng = d.geo_lon != null ? Number(d.geo_lon) : null
    return {
      value: s.value || '',                                   // полный нормализованный адрес → address_raw
      city: d.city || d.settlement || d.region || '',         // населённый пункт
      street: d.street_with_type || '',
      house: d.house || '',
      district: d.city_district_with_type || d.city_district || '', // район города (ярлык)
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    }
  })
}

// DaData «Подсказки по банкам» (suggest/bank) — поиск по БИК или названию в одном поле.
// Возвращает банк + БИК + корр. счёт для автозаполнения реквизитов клиента. Тот же токен.
const SUGGEST_BANK = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/bank'

export async function suggestBank(query, fetchImpl = fetch) {
  const tokens = await getTokens()
  const token = tokens.dadata_token
  if (!token) throw Object.assign(new Error('dadata_token_missing'), { status: 400 })
  const res = await fetchImpl(SUGGEST_BANK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ query, count: 7 }),
  })
  if (!res.ok) throw Object.assign(new Error('dadata_error'), { status: 502 })
  const json = await res.json()
  return (json?.suggestions || []).map((s) => {
    const d = s.data || {}
    return {
      value: s.value || d.name?.payment || '',          // название банка (для подписи в списке)
      bank_name: d.name?.payment || s.value || '',       // как в платёжках
      bik: d.bic || '',
      corr_account: d.correspondent_account || '',
      city: d.address?.data?.city || '',
    }
  })
}
