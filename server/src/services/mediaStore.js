import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { config } from '../config.js'
import { getDriverBotToken, getMaxDriverBotToken } from './botConfig.js'
import { MaxApi } from '../lib/maxApi.js'

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

// Расширение из URL (без query) и дефолт по типу вложения MAX.
function extFromUrl(url) {
  const clean = String(url || '').split('?')[0]
  const m = clean.match(/\.([a-zA-Z0-9]{1,5})$/)
  return m ? m[1].toLowerCase() : null
}
const defaultExt = (type) => ({ image: 'jpg', audio: 'ogg', video: 'mp4' }[type] || 'bin')

// Выбрать прямую mp4-ссылку из ответа GET /videos/{token} (urls — объект разрешений или массив).
function pickVideoUrl(info) {
  const u = info?.urls
  if (!u) return null
  if (Array.isArray(u)) return u.find((x) => /\.mp4/i.test(x)) || u[0] || null
  return u.mp4_1080 || u.mp4_720 || u.mp4_480 || u.mp4_360 || u.mp4_240 || Object.values(u).find(Boolean) || null
}

// Скачать медиа-вложение MAX в своё хранилище → вернуть URL. att — нормализованное вложение
// maxgram { type, url, token }. Фото/файл/аудио уже несут прямой url; видео — через GET /videos/{token}.
// Вызывать в ФОНЕ (как putFromTelegram). fetchImpl/dir инъектируются в тестах.
export async function putFromMax(att, { token, fetchImpl = fetch, dir } = {}) {
  const tk = token || (await getMaxDriverBotToken())
  if (!tk) throw Object.assign(new Error('no_max_bot_token'), { status: 500 })
  const api = new MaxApi(tk, { fetchImpl })
  let url = att?.url
  let ext
  if (att?.type === 'video') {
    const info = await api.getVideo(att.token)
    url = pickVideoUrl(info)
    ext = 'mp4'
  } else {
    ext = extFromUrl(url) || defaultExt(att?.type)
  }
  if (!url) throw Object.assign(new Error('max_no_media_url'), { status: 502 })
  const buf = await api.download(url)
  return put(buf, ext, dir)
}
