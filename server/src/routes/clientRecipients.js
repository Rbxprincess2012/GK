import { Router } from 'express'
import { requireRole } from '../middleware/authUser.js'
import { issueInvite, listForClient, revoke } from '../services/clientRecipients.js'
import { getClientBotUsername } from '../services/botConfig.js'

const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))

r.get('/clients/:id/recipients', async (req, res, next) => {
  try { res.json(await listForClient(Number(req.params.id))) } catch (e) { next(e) }
})

// Личный чат: выдаём ссылку t.me/<bot>?start=<code> — менеджер передаёт её человеку.
r.post('/clients/:id/recipients/dm', async (req, res, next) => {
  try {
    const row = await issueInvite(Number(req.params.id), 'dm')
    const u = await getClientBotUsername()
    res.status(201).json({ ...row, invite_link: u ? `https://t.me/${u}?start=${row.verify_code}` : null })
  } catch (e) { next(e) }
})

// Группа: выдаём код и команду — менеджер добавляет бота в группу и шлёт /bind <code>.
r.post('/clients/:id/recipients/group', async (req, res, next) => {
  try {
    const row = await issueInvite(Number(req.params.id), 'group')
    const u = await getClientBotUsername()
    res.status(201).json({ ...row, bot_username: u, bind_command: `/bind ${row.verify_code}` })
  } catch (e) { next(e) }
})

r.delete('/recipients/:id', async (req, res, next) => {
  try { res.json(await revoke(Number(req.params.id))) } catch (e) { next(e) }
})

export default r
