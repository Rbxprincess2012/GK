import { Router } from 'express'
import { z } from 'zod'
import { ask } from '../services/assistant.js'
import { db } from '../db.js'
import { requireRole } from '../middleware/authUser.js'

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

// ── Раздел суперпользователя: вопросы, на которые ИИ не нашёл ответа (или упал). ──
// Ворклист: эскалации/ошибки, ещё не помеченные «разобрано». Источник для роста базы знаний.
r.get('/unanswered', requireRole('superuser'), async (_req, res, next) => {
  try {
    const rows = await db('assistant_logs')
      .where({ resolved: false })
      .andWhere((b) => b.where('escalated', true).orWhere('ok', false))
      .orderBy('created_at', 'desc')
      .limit(100)
      .select('id', 'question', 'answer', 'ok', 'escalated', 'created_at')
    res.json({ count: rows.length, items: rows })
  } catch (e) { next(e) }
})

// Пометить вопрос разобранным — уходит из списка (лог сохраняется для статистики).
r.post('/unanswered/:id/resolve', requireRole('superuser'), async (req, res, next) => {
  try {
    const n = await db('assistant_logs').where({ id: Number(req.params.id) }).update({ resolved: true })
    if (!n) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default r
