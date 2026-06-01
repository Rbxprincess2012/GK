import { ZodError } from 'zod'

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation', issues: err.issues })
  }
  if (err.code === '23505') { // unique_violation в PostgreSQL
    return res.status(409).json({ error: 'conflict', detail: err.detail })
  }
  if (err.code === '23503') { // foreign_key_violation
    return res.status(409).json({ error: 'fk_violation', detail: err.detail })
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  return res.status(500).json({ error: 'internal' })
}

export const notFound = (_req, res) => res.status(404).json({ error: 'not_found' })
