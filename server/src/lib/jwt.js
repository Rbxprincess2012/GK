import { createHmac, timingSafeEqual } from 'node:crypto'

// Минимальный JWT HS256 на встроенном crypto (без внешних зависимостей).
const b64url = (s) => Buffer.from(s).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)

export function signToken(payload, secret, expiresInSec = 60 * 60 * 24 * 7) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ ...payload, iat: now(), exp: now() + expiresInSec }))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < now()) return null
    return payload
  } catch { return null }
}
