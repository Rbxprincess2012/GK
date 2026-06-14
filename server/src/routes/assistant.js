import { Router } from 'express'
import { z } from 'zod'
import { ask } from '../services/assistant.js'

const r = Router()

// Тело запроса. История — только user/assistant (role:'system' запрещён схемой → анти-инъекция).
const askInput = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(2000),
  })).max(10).optional(),
})

// In-memory rate-limit per-user: ≤20 запросов / 5 мин. Один api-контейнер → корректно
// (боты — отдельные процессы без этого роутера). Скользящее окно + чистка Map от утечки.
const WINDOW_MS = 5 * 60 * 1000
const LIMIT = 20
const hits = new Map() // userId → number[] (таймстемпы)
function rateLimited(userId) {
  const now = Date.now()
  const arr = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= LIMIT) { hits.set(userId, arr); return true }
  arr.push(now)
  hits.set(userId, arr)
  if (hits.size > 500) for (const [k, v] of hits) if (v.every((t) => now - t > WINDOW_MS)) hits.delete(k)
  return false
}

// POST /api/assistant/ask — монтируется под requireUser (любой залогиненный сотрудник).
r.post('/ask', async (req, res, next) => {
  try {
    const { question, history } = askInput.parse(req.body)
    const userId = req.auth?.user?.id ?? null
    if (rateLimited(userId)) {
      return res.status(429).json({ error: 'rate_limited', answer: 'Слишком много вопросов подряд — подождите минуту.' })
    }
    res.json(await ask({ userId, question, history }))
  } catch (e) {
    if (e?.issues) return res.status(400).json({ error: 'bad_request' })
    next(e)
  }
})

export default r
