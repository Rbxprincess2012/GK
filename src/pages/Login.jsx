import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Eye, EyeOff, Loader2, Truck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err?.response?.data?.error === 'invalid_credentials' ? 'Неверный email или пароль' : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#07192e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: 40,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #865fff, #f48f1b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Truck size={24} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.08em', color: '#e8ecff' }}>
            ДИСПЕТЧ<span style={{ color: '#f48f1b' }}>ЕР</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#92a2d4', marginTop: 4 }}>
            Система управления заявками
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92a2d4', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@dispatcher.ru"
              required
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '10px 14px',
                color: '#e8ecff', fontSize: '0.9rem',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(134,95,255,0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92a2d4', marginBottom: 6 }}>
              Пароль
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '10px 40px 10px 14px',
                  color: '#e8ecff', fontSize: '0.9rem',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(134,95,255,0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#92a2d4', display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#e8ecff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#92a2d4'}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  background: 'rgba(255,70,85,0.1)',
                  border: '1px solid rgba(255,70,85,0.2)',
                  borderRadius: 10, padding: '8px 14px',
                  color: '#ff4655', fontSize: '0.85rem', textAlign: 'center',
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ opacity: loading ? 1 : 0.9 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            style={{
              width: '100%', padding: '11px 18px',
              background: 'linear-gradient(135deg, #865fff, #5b3fd4)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontWeight: 600, fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Вход...</> : 'Войти'}
          </motion.button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.75rem', color: '#92a2d4' }}>
          clockerinfo@gmail.com · super12345
        </div>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
