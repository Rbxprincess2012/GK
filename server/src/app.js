import express from 'express'
import api from './routes/index.js'
import publicReport from './routes/publicReport.js'
import { config } from './config.js'
import { errorHandler, notFound } from './middleware/error.js'

const ALLOWED = config.CORS_ORIGIN ? config.CORS_ORIGIN.split(',').map((s) => s.trim()) : null

export function createApp() {
  const app = express()

  // CORS. В проде CORS_ORIGIN ограничивает домен(ы) фронта; пусто = разрешить любой (dev).
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (!ALLOWED) res.header('Access-Control-Allow-Origin', origin || '*')
    else if (origin && ALLOWED.includes(origin)) res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.use(express.json({ limit: '5mb' }))
  // Медиа-пруф (фото/видео/голос), скачанный из Telegram в своё хранилище.
  app.use('/media', express.static(config.MEDIA_DIR))
  // Публичный фотоотчёт клиенту — без авторизации, до /api.
  app.use(publicReport)
  app.use('/api', api)
  app.use('/api', notFound) // неизвестные /api-маршруты
  app.use(errorHandler)
  return app
}
