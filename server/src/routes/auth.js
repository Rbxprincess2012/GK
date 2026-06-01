import { Router } from 'express'
import * as users from '../services/users.js'
import { signToken } from '../lib/jwt.js'
import { config } from '../config.js'
import { loginInput } from '../validators/user.js'
import { requireUser } from '../middleware/authUser.js'
import { assignableRoles } from '../services/users.js'

const r = Router()

r.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginInput.parse(req.body)
    const user = await users.authenticate(email, password)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })
    const token = signToken({ sub: user.id, role: user.role, email: user.email }, config.AUTH_SECRET)
    res.json({ token, user })
  } catch (e) { next(e) }
})

r.get('/me', requireUser, async (req, res, next) => {
  try {
    const user = await users.getById(req.auth.user.id)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    res.json({ user, assignable_roles: assignableRoles(user.role) })
  } catch (e) { next(e) }
})

export default r
