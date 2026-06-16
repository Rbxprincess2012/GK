import { Router } from 'express'
import * as pricing from '../services/pricing.js'

// Публичные эндпоинты (без авторизации) — для лендинга putevo.su. Монтируется
// до requireUserOrService в routes/index.js.
const r = Router()

// Витрина цен/скидок для лендинга (та же настройка, что и в админке «Цены»).
r.get('/pricing', async (_req, res, next) => {
  try { res.json(await pricing.publicTable()) } catch (e) { next(e) }
})

export default r
