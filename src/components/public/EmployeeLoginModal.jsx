import { useState } from 'react'
import { motion } from 'motion/react'
import { Eye, EyeOff, Loader2, X, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

// Многошаговая модалка авторизации сотрудника (эпик #3).
// Режимы: login → (forgot → reset) | (register → code → done).
// «done» — welcome-экран, приглашающий войти (вход директор делает сам).
export function EmployeeLoginModal({ onClose, onBack }) {
  const { login, register, confirmCode, forgotPassword, resetWithCode } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const go = (m) => { setError(''); setInfo(''); setCode(''); setMode(m) }
  const errText = (e, fallback) => {
    const code = e?.response?.data?.error
    return ({
      invalid_credentials: 'Неверный email или пароль',
      not_granted: 'Этому email не предоставлен доступ. Обратитесь к администратору.',
      invalid_code: 'Неверный код',
      code_expired: 'Код истёк — запросите новый',
      no_pending_code: 'Код не запрашивался или уже использован',
      too_many_attempts: 'Слишком много попыток — запросите новый код',
    }[code]) || fallback
  }

  // Вход. Если почта не подтверждена — пересылаем код и ведём на экран кода.
  const onLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      if (err?.response?.data?.error === 'email_not_verified') {
        try { await register(email, password) } catch { /* код мог не уйти — экран позволит повторить */ }
        setLoading(false); go('code'); setInfo('Подтвердите почту — код отправлен.')
        return
      }
      setError(errText(err, 'Ошибка входа')); setLoading(false)
    }
  }

  const onRegister = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await register(email, password)
      setLoading(false); go('code'); setInfo(`Код отправлен на ${email}`)
    } catch (err) { setError(errText(err, 'Не удалось зарегистрироваться')); setLoading(false) }
  }

  const onConfirm = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await confirmCode(email, code)
      setLoading(false); setMode('done')
    } catch (err) { setError(errText(err, 'Не удалось подтвердить код')); setLoading(false) }
  }

  const onForgot = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await forgotPassword(email)
      setLoading(false); go('reset'); setInfo('Если email зарегистрирован, мы отправили код.')
    } catch (err) { setError(errText(err, 'Ошибка')); setLoading(false) }
  }

  const onReset = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await resetWithCode(email, code, password) // успех → откроется сессия, модалка исчезнет
    } catch (err) { setError(errText(err, 'Не удалось сменить пароль')); setLoading(false) }
  }

  const resendCode = async () => {
    setError(''); setInfo('')
    try { await register(email, password); setInfo('Код отправлен повторно.') }
    catch (err) { setError(errText(err, 'Не удалось отправить код')) }
  }

  const titles = {
    login: ['Вход для сотрудника', 'Введите рабочую почту и пароль'],
    register: ['Регистрация', 'Доступ должен быть предоставлен администратором'],
    code: ['Подтверждение почты', 'Введите код из письма'],
    forgot: ['Восстановление пароля', 'Укажите почту — отправим код'],
    reset: ['Новый пароль', 'Введите код из письма и новый пароль'],
    done: ['', ''],
  }
  const [title, sub] = titles[mode]

  const emailField = (
    <div className="pub-field">
      <label className="pub-label">Email</label>
      <input className="pub-input" type="email" value={email} required
        placeholder="director@company.ru" onChange={(e) => setEmail(e.target.value)} />
    </div>
  )
  const passField = (label = 'Пароль') => (
    <div className="pub-field">
      <label className="pub-label">{label}</label>
      <div className="pub-pass-wrap">
        <input className="pub-input pub-input--pass" type={showPass ? 'text' : 'password'}
          value={password} required placeholder="••••••••" minLength={8}
          onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="pub-pass-toggle" onClick={() => setShowPass((v) => !v)}>
          {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
  const codeField = (
    <div className="pub-field">
      <label className="pub-label">Код из письма</label>
      <input className="pub-input pub-code-input" inputMode="numeric" maxLength={6} value={code}
        required placeholder="000000" onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
    </div>
  )
  const submitBtn = (label) => (
    <button className="pub-submit" type="submit" disabled={loading}>
      {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Подождите…</> : label}
    </button>
  )

  return (
    <div className="pub-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        className="pub-modal" style={{ position: 'relative' }}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <button className="pub-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        {mode !== 'login' && mode !== 'done' && (
          <button className="pub-back" onClick={() => go('login')}><ArrowLeft size={14} /> Назад</button>
        )}
        {mode === 'login' && onBack && (
          <button className="pub-back" onClick={onBack}><ArrowLeft size={14} /> Назад</button>
        )}

        {mode === 'done' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <CheckCircle2 size={48} color="#4ade80" />
            </div>
            <div className="pub-modal-title">Регистрация завершена</div>
            <div className="pub-modal-sub">Почта подтверждена. Войдите в личный кабинет.</div>
            <button className="pub-submit" style={{ marginTop: 8 }}
              onClick={() => { setPassword(''); go('login') }}>Войти</button>
          </div>
        ) : (
          <>
            <div className="pub-modal-title">{title}</div>
            <div className="pub-modal-sub">{sub}</div>

            {info && <div className="pub-info">{info}</div>}
            {error && <div className="pub-error">{error}</div>}

            {mode === 'login' && (
              <form onSubmit={onLogin}>
                {emailField}{passField()}
                {submitBtn('Войти')}
                <div className="pub-link-row" style={{ gap: 16 }}>
                  <button type="button" className="pub-link" onClick={() => go('forgot')}>Забыли пароль?</button>
                  <button type="button" className="pub-link" onClick={() => { setPassword(''); go('register') }}>Регистрация</button>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={onRegister}>
                {emailField}{passField('Придумайте пароль')}
                {submitBtn('Зарегистрироваться')}
              </form>
            )}

            {mode === 'code' && (
              <form onSubmit={onConfirm}>
                {codeField}
                {submitBtn('Подтвердить код')}
                <div className="pub-link-row">
                  <button type="button" className="pub-link" onClick={resendCode}>Отправить код ещё раз</button>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={onForgot}>
                {emailField}
                {submitBtn('Отправить код')}
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={onReset}>
                {codeField}{passField('Новый пароль')}
                {submitBtn('Сменить пароль')}
              </form>
            )}
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </div>
  )
}
