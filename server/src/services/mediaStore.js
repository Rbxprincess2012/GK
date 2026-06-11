import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { config } from '../config.js'
import { getDriverBotToken } from './botConfig.js'

// Своё хранилище медиа-пруфа (file_url первичен; tg_file_id — кэш на стороне attachments).
// Сейчас — диск (volume на VPS). Позже под SaaS можно заменить на S3/MinIO той же сигнатурой.
export async function put(buffer, ext = 'bin', dir = config.MEDIA_DIR) {
  await mkdir(dir, { recursive: true })
  const name = `${randomUUID()}.${ext}`
  await writeFile(path.join(dir, name), buffer)
  return `/media/${name}`
}

// Скачать файл из Telegram по file_id и положить в своё хранилище → вернуть URL.
// fetchImpl/dir инъектируются в тестах. Вызывать в ФОНЕ — чтобы дохлая сеть не блокировала коммит.
export async function putFromTelegram(fileId, { token, fetchImpl = fetch, dir } = {}) {
  // Токен по умолчанию — тот же, что у бота (Настройки/БД, .env как фолбэк). Иначе при токене
  // только в админке getFile уходил с botundefined и докачка молча падала (file_url пуст).
  const tk = token || (await getDriverBotToken())
  if (!tk) throw Object.assign(new Error('no_bot_token'), { status: 500 })
  const metaRes = await fetchImpl(`https://api.telegram.org/bot${tk}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const meta = await metaRes.json()
  const filePath = meta?.result?.file_path
  if (!filePath) throw Object.assign(new Error('tg_getfile_failed'), { status: 502 })
  const fileRes = await fetchImpl(`https://api.telegram.org/file/bot${tk}/${filePath}`)
  const buf = Buffer.from(await fileRes.arrayBuffer())
  const ext = filePath.split('.').pop() || 'bin'
  return put(buf, ext, dir)
}
