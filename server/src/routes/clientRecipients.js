import { Router } from 'express'
import { requireRole } from '../middleware/authUser.js'
import { issueInvite, listForClient, revoke, groupRecipient, ensureGroupInvite } from '../services/clientRecipients.js'
import { getClientBotUsername, getMaxClientBotUsername } from '../services/botConfig.js'

const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))

const channelOf = (req) => (req.query.channel === 'max' ? 'max' : 'telegram')
const usernameFor = (channel) => (channel === 'max' ? getMaxClientBotUsername() : getClientBotUsername())
// deep-link с payload <code> (получатель-личка): Telegram t.me/<bot>?start=, MAX max.ru/<bot>?start=.
const dmLink = (channel, username, code) => (username
  ? (channel === 'max' ? `https://max.ru/${username}?start=${code}` : `https://t.me/${username}?start=${code}`)
  : null)
// Команда привязки группы. В Telegram (privacy-mode) нужна с явным @username; в MAX бот видит
// сообщения только как админ — формат с @ безвреден (наш парсер срезает @bot).
const bindCommand = (u, code) => (u ? `/bind@${u} ${code}` : `/bind ${code}`)

r.get('/clients/:id/recipients', async (req, res, next) => {
  try { res.json(await listForClient(Number(req.params.id))) } catch (e) { next(e) }
})

// Личный чат: выдаём deep-link ссылку — менеджер передаёт её человеку.
r.post('/clients/:id/recipients/dm', async (req, res, next) => {
  try {
    const channel = channelOf(req)
    const row = await issueInvite(Number(req.params.id), 'dm', channel)
    const u = await usernameFor(channel)
    res.status(201).json({ ...row, invite_link: dmLink(channel, u, row.verify_code) })
  } catch (e) { next(e) }
})

// Текущее состояние групповой привязки канала (для карточки MAX/Telegram).
r.get('/clients/:id/recipients/group', async (req, res, next) => {
  try {
    const channel = channelOf(req)
    const u = await usernameFor(channel)
    const row = await groupRecipient(Number(req.params.id), channel)
    res.json({
      id: row?.id ?? null,
      status: row?.status ?? null,
      title: row?.title ?? null,
      bot_username: u,
      bind_command: row?.status === 'pending' ? bindCommand(u, row.verify_code) : null,
    })
  } catch (e) { next(e) }
})

// Группа: идемпотентно гарантируем код и отдаём команду /bind <code> (повторный вызов не плодит дубли).
r.post('/clients/:id/recipients/group', async (req, res, next) => {
  try {
    const channel = channelOf(req)
    const row = await ensureGroupInvite(Number(req.params.id), channel)
    const u = await usernameFor(channel)
    res.status(201).json({
      id: row.id,
      status: row.status,
      title: row.title ?? null,
      bot_username: u,
      bind_command: row.status === 'pending' ? bindCommand(u, row.verify_code) : null,
    })
  } catch (e) { next(e) }
})

r.delete('/recipients/:id', async (req, res, next) => {
  try { res.json(await revoke(Number(req.params.id))) } catch (e) { next(e) }
})

export default r
