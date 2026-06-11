import { Router } from 'express'
import { db } from '../db.js'
import { buildClientMessage, buildDeepLink, buildClientChatLink, logClientMessage, ensurePublicToken } from '../services/clientMessaging.js'
import { requireRole } from '../middleware/authUser.js'

const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))

// Собрать текст сообщения клиенту по заявке (превью для админки) + диплинки в личку.
r.get('/client-message/:orderId', async (req, res, next) => {
  try {
    const id = Number(req.params.orderId)
    await ensurePublicToken(id) // чтобы отчёт-ссылка была даже по частичным заявкам
    const msg = await buildClientMessage(id, { templateId: req.query.template })
    if (!msg) return res.status(404).json({ error: 'not_found' })
    const ph = await db('orders as o')
      .leftJoin('trusted_persons as tp', 'tp.id', 'o.trusted_person_id')
      .where('o.id', id).select('tp.phone as phone').first()
    const phone = ph?.phone || null
    res.json({
      body: msg.body,
      report_url: msg.vars.report_url,
      phone,
      client_chat: buildClientChatLink(msg.head?.client_telegram_chat), // приоритетный чат клиента
      deeplinks: phone ? { telegram: buildDeepLink(phone, 'telegram'), max: buildDeepLink(phone, 'max') } : null,
    })
  } catch (e) { next(e) }
})

// Зафиксировать факт отправки (менеджер скопировал текст / открыл диплинк).
r.post('/client-message/:orderId/log', async (req, res, next) => {
  try {
    const id = Number(req.params.orderId)
    res.status(201).json(await logClientMessage(id, {
      userId: req.auth?.user?.id || null,
      body: req.body?.body || '',
      templateId: req.body?.template || null,
      channels: req.body?.channels || 'copied',
    }))
  } catch (e) { next(e) }
})

export default r
