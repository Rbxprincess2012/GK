import { db } from '../db.js'

const KEY = 'integration_tokens'

// Универсальные get/set по ключу настроек (jsonb).
export async function getSetting(key) {
  const row = await db('settings').where({ key }).first()
  return row?.value ?? null
}

export async function setSetting(key, value) {
  await db('settings').insert({ key, value }).onConflict('key').merge()
  return value
}

export async function getTokens() {
  const row = await db('settings').where({ key: KEY }).first()
  return row?.value || {}
}

export async function setTokens(value) {
  await db('settings').insert({ key: KEY, value }).onConflict('key').merge()
  return value
}
