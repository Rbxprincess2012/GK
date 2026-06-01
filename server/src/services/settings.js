import { db } from '../db.js'

const KEY = 'integration_tokens'

export async function getTokens() {
  const row = await db('settings').where({ key: KEY }).first()
  return row?.value || {}
}

export async function setTokens(value) {
  await db('settings').insert({ key: KEY, value }).onConflict('key').merge()
  return value
}
