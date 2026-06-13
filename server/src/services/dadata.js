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
    legal_name: d.name?.full_with_opf || s.value || '',
    inn: d.inn || '',
    kpp: d.kpp || '',
    ogrn: d.ogrn || '',
    legal_address: d.address?.unrestricted_value || d.address?.value || '',
    management_name: d.management?.name || '',
    management_post: d.management?.post || '',
  }
}
