import { useState } from 'react'
import { motion } from 'motion/react'
import { Eye, EyeOff, Loader2, X, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

// Модалка входа сотрудника (email + пароль). Открывается с витрины после выбора
// «Сотрудник». При успешном входе AuthContext.user становится не-null — приложение
// само перерисуется в рабочее пространство, поэтому здесь достаточно вызвать login().
// Ссылки «Забыл пароль» / «Регистрация» — задел под эпик #3 (пока заглушки).
export function EmployeeLoginModal({ onClose, onBack }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      // успех — родитель размонтируется вместе с витриной
    } catch (err) {
      setError(err?.response?.data?.error === 'invalid_credentials' ? 'Неверный email или пароль' : 'Ошибка входа')
      setLoading(false)
    }
  }

  return (
    <div className="pub-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        className="pub-modal"
        style={{ position: 'relative' }}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <button className="pub-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        {onBack && (
          <button className="pub-back" onClick={onBack}><ArrowLeft size={14} /> Назад</button>
        )}

        <div className="pub-modal-title">Вход для сотрудника</div>
        <div className="pub-modal-sub">Введите рабочую почту и пароль</div>

        <form onSubmit={handleSubmit}>
          <div className="pub-field">
            <label className="pub-label">Email</label>
            <input className="pub-input" type="email" value={email} required
              placeholder="manager@putevo.su" onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="pub-field">
            <label className="pub-label">Пароль</label>
            <div className="pub-pass-wrap">
              <input className="pub-input pub-input--pass" type={showPass ? 'text' : 'password'}
                value={password} required placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="pub-pass-toggle" onClick={() => setShowPass((v) => !v)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <div className="pub-error">{error}</div>}

          <button className="pub-submit" type="submit" disabled={loading}>
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Вход…</> : 'Войти'}
          </button>
        </form>

        <div className="pub-link-row">
          <button className="pub-link" disabled title="Скоро">Забыли пароль?</button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </div>
  )
}
