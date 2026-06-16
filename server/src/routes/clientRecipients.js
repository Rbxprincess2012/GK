import { Router } from 'express'
import { requireRole } from '../middleware/authUser.js'
import { issueInvite, listForClient, revoke } from '../services/clientRecipients.js'
import { getClientBotUsername, getMaxClientBotUsername } from '../services/botConfig.js'

const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))

const channelOf = (req) => (req.query.channel === 'max' ? 'max' : 'telegram')
const usernameFor = (channel) => (channel === 'max' ? getMaxClientBotUsername() : getClientBotUsername())
// deep-link с payload <code> (получатель-личка): Telegram t.me/<bot>?start=, MAX max.ru/<bot>?start=.
const dmLink = (channel, username, code) => (username
  ? (channel === 'max' ? `https://max.ru/${username}?start=${code}` : `https://t.me/${username}?start=${code}`)
  : null)

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

// Группа: выдаём код и команду — менеджер добавляет бота в группу и шлёт /bind <code>.
r.post('/clients/:id/recipients/group', async (req, res, next) => {
  try {
    const channel = channelOf(req)
    const row = await issueInvite(Number(req.params.id), 'group', channel)
    const u = await usernameFor(channel)
    // В группе бот с включённым privacy-mode получает команду только с явным @username.
    // Поэтому отдаём «/bind@bot <code>» — иначе /bind в группе «не подхватывается».
    const bind_command = u ? `/bind@${u} ${row.verify_code}` : `/bind ${row.verify_code}`
    res.status(201).json({ ...row, bot_username: u, bind_command })
  } catch (e) { next(e) }
})

r.delete('/recipients/:id', async (req, res, next) => {
  try { res.json(await revoke(Number(req.params.id))) } catch (e) { next(e) }
})

export default r
