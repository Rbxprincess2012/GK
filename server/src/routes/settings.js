import { Router } from 'express'
import { z } from 'zod'
import * as svc from '../services/settings.js'

const r = Router()

// Токены интеграций (директор/суперюзер). Набор расширяемый.
const tokensInput = z.object({
  telegram_client_bot_token: z.string().optional(),
  telegram_driver_bot_token: z.string().optional(),
  yandex_api_key: z.string().optional(),
  yandex_folder_id: z.string().optional(),
  n8n_service_token: z.string().optional(),
}).passthrough()

r.get('/tokens', async (_req, res, next) => {
  try { res.json(await svc.getTokens()) } catch (e) { next(e) }
})

r.put('/tokens', async (req, res, next) => {
  try { res.json(await svc.setTokens(tokensInput.parse(req.body))) } catch (e) { next(e) }
})

export default r
