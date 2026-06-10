import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Eye, EyeOff, Loader2, Truck, CheckCircle2, AlertTriangle } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

const card = {
  width: '100%', maxWidth: 380, background: '#07192e',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 40,
}
const label = { display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92a2d4', marginBottom: 6 }
const input = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 40px 10px 14px',
  color: '#e8ecff', fontSize: '0.9rem', outline: 'none',
}

export default function SetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const { activateSession } = useAuth()

  const [status, setStatus] = useState('loading') // loading | valid | invalid | expired
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    (async () => {
      try {
        const { data } = await api.get(`/auth/invite/${token}`)
        setEmail(data.email)
        setStatus(data.expired ? 'expired' : 'valid')
      } catch { setStatus('invalid') }
    })()
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Минимум 8 символов'); return }
    if (password !== confirm) { setError('Пароли не совпадают'); return }
    setSubmitting(true)
    try {
      const { data } = await api.post(`/auth/invite/${token}`, { password })
      await activateSession(data.token)
      navigate('/', { replace: true })
    } catch (err) {
      const code = err?.response?.data?.error
      setError(code === 'token_expired' ? 'Срок ссылки истёк' : code === 'invalid_token' ? 'Ссылка недействительна' : 'Не удалось сохранить пароль')
      setSubmitting(false)
    }
  }

  const wrap = (children) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} style={card}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: 'linear-gradient(135deg, #865fff, #f48f1b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={24} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.08em', color: '#e8ecff' }}>
            ДИСПЕТЧ<span style={{ color: '#f48f1b' }}>ЕР</span>
          </div>
        </div>
        {children}
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (status === 'loading') return wrap(
    <div style={{ textAlign: 'center', color: '#92a2d4', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> Проверяем ссылку…
    </div>
  )

  if (status === 'invalid' || status === 'expired') return wrap(
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <AlertTriangle size={34} color="#ff4655" />
      <div style={{ color: '#e8ecff', fontWeight: 600 }}>
        {status === 'expired' ? 'Срок действия ссылки истёк' : 'Ссылка недействительна'}
      </div>
      <div style={{ color: '#92a2d4', fontSize: '0.85rem' }}>
        Попросите администратора выслать новое приглашение.
      </div>
      <button onClick={() => navigate('/login')} style={{ marginTop: 6, background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', color: '#92a2d4', cursor: 'pointer' }}>
        На страницу входа
      </button>
    </div>
  )

  return wrap(
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ textAlign: 'center', color: '#92a2d4', fontSize: '0.85rem', marginBottom: 2 }}>
        Задайте пароль для входа<br /><span style={{ color: '#e8ecff', fontWeight: 600 }}>{email}</span>
      </div>

      <div>
        <label style={label}>Новый пароль</label>
        <div style={{ position: 'relative' }}>
          <input type={showPass ? 'text' : 'password'} value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)} placeholder="не менее 8 символов" style={input} />
          <button type="button" onClick={() => setShowPass((v) => !v)}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#92a2d4', display: 'flex' }}>
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label style={label}>Повторите пароль</label>
        <input type={showPass ? 'text' : 'password'} value={confirm}
          onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" style={{ ...input, paddingRight: 14 }} />
      </div>

      {error && (
        <div style={{ background: 'rgba(255,70,85,0.1)', border: '1px solid rgba(255,70,85,0.2)', borderRadius: 10, padding: '8px 14px', color: '#ff4655', fontSize: '0.85rem', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <motion.button type="submit" disabled={submitting} whileTap={{ scale: submitting ? 1 : 0.98 }}
        style={{ width: '100%', padding: '11px 18px', background: 'linear-gradient(135deg, #865fff, #5b3fd4)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {submitting
          ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Сохраняем…</>
          : <><CheckCircle2 size={16} /> Задать пароль и войти</>}
      </motion.button>
    </form>
  )
}
