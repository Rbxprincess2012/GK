import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

// Хеширование паролей на встроенном scrypt (без внешних зависимостей).
// Формат хранения: "<salt_hex>:<hash_hex>".
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hashHex] = stored.split(':')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
