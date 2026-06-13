import { Router } from 'express'
import { z } from 'zod'
import * as svc from '../services/settings.js'
import { geocode } from '../lib/geocode.js'
import { findPartyByInn } from '../services/dadata.js'

const r = Router()

// Токены интеграций (директор/менеджер/суперюзер). Набор расширяемый.
const tokensInput = z.object({
  telegram_client_bot_token: z.string().optional(),
  telegram_driver_bot_token: z.string().optional(),
  max_bot_token: z.string().optional(),
  yandex_api_key: z.string().optional(),
  yandex_folder_id: z.string().optional(),
  yandex_geocoder_key: z.string().optional(),
  yandex_jsapi_key: z.string().optional(),
  dadata_token: z.string().optional(),
  n8n_service_token: z.string().optional(),
}).passthrough()

r.get('/tokens', async (_req, res, next) => {
  try { res.json(await svc.getTokens()) } catch (e) { next(e) }
})
r.put('/tokens', async (req, res, next) => {
  try { res.json(await svc.setTokens(tokensInput.parse(req.body))) } catch (e) { next(e) }
})

// База: адрес + координаты. При сохранении адреса пытаемся геокодировать.
const baseInput = z.object({
  address: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
}).strict()

r.get('/base', async (_req, res, next) => {
  try { res.json((await svc.getSetting('base')) || { address: '', lat: null, lng: null }) } catch (e) { next(e) }
})
r.put('/base', async (req, res, next) => {
  try {
    const input = baseInput.parse(req.body)
    let { address = '', lat = null, lng = null } = input
    // Если координаты не заданы вручную, но есть адрес — геокодируем.
    if ((lat == null || lng == null) && address.trim()) {
      const hit = await geocode(address)
      if (hit) { lat = hit.lat; lng = hit.lng }
    }
    res.json(await svc.setSetting('base', { address, lat, lng }))
  } catch (e) { next(e) }
})

// Параметры распределения: вес километра, регион-префикс для геокодинга.
const distributionInput = z.object({
  km_weight: z.number().min(0).optional(),
  region: z.string().optional(),
  geocoder: z.enum(['yandex', 'nominatim']).optional(),
}).strict()

r.get('/distribution', async (_req, res, next) => {
  try { res.json((await svc.getSetting('distribution')) || { km_weight: 0.1 }) } catch (e) { next(e) }
})
r.put('/distribution', async (req, res, next) => {
  try {
    const cur = (await svc.getSetting('distribution')) || {}
    res.json(await svc.setSetting('distribution', { ...cur, ...distributionInput.parse(req.body) }))
  } catch (e) { next(e) }
})

// Шаблоны сообщений клиенту (диплинк в личку + бот). Плейсхолдеры: {client}{number}{date}{address}{driver}{sections}{amount}{report_url}.
const DEFAULT_TEMPLATES = [
  { id: 'report', title: 'Вывоз выполнен', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} — выполнено ✅\n\nОбъект: {address}\nВодитель: {driver}\n\nПо участкам:\n{sections}\n\nСумма: {amount}\n\nФотоотчёт: {report_url}' },
  { id: 'accepted', title: 'Заявка принята', body: 'Здравствуйте, {client}!\n\nВаша заявка №{number} принята в работу на {date}.\nОбъект: {address}\n\nСообщим, когда вывоз будет выполнен.' },
  { id: 'enroute', title: 'Машина выехала', body: '{client}, машина выехала к вам на объект {address}.\nВодитель: {driver}.' },
  { id: 'partial', title: 'Вывоз частично', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} выполнена частично.\nОбъект: {address}\n\nПо участкам:\n{sections}\n\nФотоотчёт: {report_url}' },
]
const templatesInput = z.array(z.object({
  id: z.string().min(1), title: z.string().min(1), body: z.string().min(1),
})).max(30)

r.get('/client-templates', async (_req, res, next) => {
  try { res.json((await svc.getSetting('client_message_templates')) || DEFAULT_TEMPLATES) } catch (e) { next(e) }
})
r.put('/client-templates', async (req, res, next) => {
  try { res.json(await svc.setSetting('client_message_templates', templatesInput.parse(req.body))) } catch (e) { next(e) }
})

// Реквизиты компании-оператора: название (для приглашений) + юр./банковские данные
// (на будущее — счета и документы). Все поля опциональны.
const orgInput = z.object({
  company_name: z.string().optional(),
  legal_name: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  legal_address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account: z.string().optional(),
  bik: z.string().optional(),
  corr_account: z.string().optional(),
}).strict()
r.get('/org', async (_req, res, next) => {
  try { res.json((await svc.getSetting('org')) || { company_name: '' }) } catch (e) { next(e) }
})
r.put('/org', async (req, res, next) => {
  try {
    const cur = (await svc.getSetting('org')) || {}
    res.json(await svc.setSetting('org', { ...cur, ...orgInput.parse(req.body) }))
  } catch (e) { next(e) }
})

// Автоподстановка реквизитов организации по ИНН/ОГРН через DaData.
r.post('/dadata/party', async (req, res, next) => {
  try {
    const query = String(req.body?.query || '').trim()
    if (!query) return res.status(400).json({ error: 'query_required' })
    const data = await findPartyByInn(query)
    if (!data) return res.status(404).json({ error: 'not_found' })
    res.json(data)
  } catch (e) { next(e) }
})

export default r
