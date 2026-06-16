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
    legal_address: d.address?.unrestricted_value || d.address?.value || '',
    management_name: d.management?.name || '',
    management_post: d.management?.post || '',
  }
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
