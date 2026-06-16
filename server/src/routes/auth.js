import { Router } from 'express'
import * as users from '../services/users.js'
import * as companies from '../services/companies.js'
import * as sessions from '../services/sessions.js'
import { signToken } from '../lib/jwt.js'
import { config } from '../config.js'
import { loginInput, setPasswordInput, registerInput, verifyCodeInput, forgotInput, resetCodeInput } from '../validators/user.js'
import { requireUser } from '../middleware/authUser.js'
import { assignableRoles } from '../services/users.js'

const r = Router()

const issue = (user, sid = null) =>
  signToken({ sub: user.id, role: user.role, email: user.email, cid: user.company_id ?? null, sid }, config.AUTH_SECRET)

// Завершение входа (общее для login/verify-code/reset-code/invite): проверка
// биллинга тенанта (старт триала на первом входе + срок доступа) → открытие
// сессии журнала посещений → выпуск токена. Возвращает { token } | { status, error }.
async function loginResult(user, req) {
  const gate = await companies.applyAccessOnLogin(user)
  if (gate.error) return { status: 403, error: gate.error }
  const session = await sessions.start(user, req)
  return { token: issue(user, session?.id ?? null) }
}

r.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginInput.parse(req.body)
    const user = await users.authenticate(email, password)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })
    // Пароль верный, но почта не подтверждена кодом — направляем на подтверждение.
    if (!user.email_verified) return res.status(403).json({ error: 'email_not_verified', email: user.email })
    const out = await loginResult(user, req)
    if (out.error) return res.status(out.status).json({ error: out.error })
    res.json({ token: out.token, user })
  } catch (e) { next(e) }
})

// Саморегистрация директора (email заранее разрешён супером) → код на почту.
r.post('/register', async (req, res, next) => {
  try {
    res.json(await users.registerDirector(registerInput.parse(req.body)))
  } catch (e) { next(e) }
})

// Подтверждение кода регистрации → сразу выдаём сессию (первый вход директора).
r.post('/verify-code', async (req, res, next) => {
  try {
    const user = await users.verifyRegistration(verifyCodeInput.parse(req.body))
    const out = await loginResult(user, req)
    if (out.error) return res.status(out.status).json({ error: out.error })
    res.json({ token: out.token, user })
  } catch (e) { next(e) }
})

// «Забыл пароль»: код на почту (ответ всегда { ok: true } — не раскрываем email).
r.post('/forgot-password', async (req, res, next) => {
  try {
    res.json(await users.forgotPassword(forgotInput.parse(req.body)))
  } catch (e) { next(e) }
})

// Сброс пароля по коду → новый пароль + сессия.
r.post('/reset-code', async (req, res, next) => {
  try {
    const user = await users.resetPasswordWithCode(resetCodeInput.parse(req.body))
    const out = await loginResult(user, req)
    if (out.error) return res.status(out.status).json({ error: out.error })
    res.json({ token: out.token, user })
  } catch (e) { next(e) }
})

// Приглашение: проверить токен (публично) — для страницы установки пароля.
r.get('/invite/:token', async (req, res, next) => {
  try {
    const info = await users.getInvite(req.params.token)
    if (!info) return res.status(404).json({ error: 'invalid_token' })
    res.json(info) // { email, expired }
  } catch (e) { next(e) }
})

// Приглашение: задать пароль по токену (публично) → сразу выдаём сессию.
r.post('/invite/:token', async (req, res, next) => {
  try {
    const { password } = setPasswordInput.parse(req.body)
    const user = await users.setPasswordByToken(req.params.token, password)
    const out = await loginResult(user, req)
    if (out.error) return res.status(out.status).json({ error: out.error })
    res.json({ token: out.token, user })
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
