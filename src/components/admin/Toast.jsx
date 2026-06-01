import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirm, setConfirm] = useState(null)
  const idRef = useRef(0)

  const show = useCallback((msg, type = 'info', duration = 4000) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration)
  }, [])

  const askConfirm = useCallback((msg) => new Promise((resolve) => {
    setConfirm({ msg, resolve })
  }), [])

  const resolveConfirm = (ok) => {
    confirm?.resolve(ok)
    setConfirm(null)
  }

  const toast = {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
    confirm: askConfirm,
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="a-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`a-toast a-toast--${t.type}`}>
            {t.type === 'success' && <span className="a-toast-icon">✓</span>}
            {t.type === 'error' && <span className="a-toast-icon">✕</span>}
            {t.type === 'info' && <span className="a-toast-icon">i</span>}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      {confirm && (
        <div className="a-confirm-overlay" onClick={() => resolveConfirm(false)}>
          <div className="a-confirm-box" onClick={(e) => e.stopPropagation()}>
            <p className="a-confirm-msg">{confirm.msg}</p>
            <div className="a-confirm-actions">
              <button className="a-btn a-btn--ghost" onClick={() => resolveConfirm(false)}>Отмена</button>
              <button className="a-btn a-btn--primary" onClick={() => resolveConfirm(true)}>Подтвердить</button>
            </div>
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
