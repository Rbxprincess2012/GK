import { useState, useRef, useEffect } from 'react'
import api from '@/lib/api'

// Плавающий ИИ-помощник саппорта. Кнопка снизу справа → панель чата. Ответы помечены «ответ ИИ»,
// дисклеймер сверху. История держится в state и шлётся в запрос. Стиль — тёмная тема проекта.
const fab = {
  position: 'fixed', right: 20, bottom: 20, width: 52, height: 52, borderRadius: '50%', border: 'none',
  cursor: 'pointer', fontSize: 22, color: '#fff', background: 'linear-gradient(135deg, #f7a233, #d97a0e)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.35)', zIndex: 1000,
}
const panel = {
  position: 'fixed', right: 20, bottom: 84, width: 360, maxWidth: 'calc(100vw - 40px)',
  height: 520, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column',
  background: '#141b30', border: '1px solid #2a3556', borderRadius: 14,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden',
}
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', fontWeight: 700, color: '#e8ecff', borderBottom: '1px solid #2a3556' }
const disclaimer = { padding: '6px 14px', fontSize: '0.72rem', color: '#92a2d4', background: '#11182b' }
const body = { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }
const userMsg = { alignSelf: 'flex-end', maxWidth: '85%', background: '#2a3556', color: '#e8ecff', padding: '8px 10px', borderRadius: 10, fontSize: '0.86rem' }
const aiMsg = { alignSelf: 'flex-start', maxWidth: '90%', background: '#1b2440', color: '#e8ecff', padding: '8px 10px', borderRadius: 10, fontSize: '0.86rem' }
const aiLabel = { fontSize: '0.68rem', color: '#7d8bbf', marginBottom: 3 }
const inputRow = { display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #2a3556', alignItems: 'flex-end' }

export function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([]) // { role:'user'|'assistant', text, ai? }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, open])

  const send = async () => {
    const q = input.trim()
    if (!q || busy) return
    const history = msgs.map((m) => ({ role: m.role, text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setBusy(true)
    try {
      const { data } = await api.post('/assistant/ask', { question: q, history }, { timeout: 35000 })
      setMsgs((m) => [...m, { role: 'assistant', text: data.answer, ai: true }])
    } catch (e) {
      const msg = e?.response?.status === 429
        ? (e.response.data?.answer || 'Слишком много вопросов подряд — подождите минуту.')
        : 'Не удалось получить ответ. Попробуйте позже.'
      setMsgs((m) => [...m, { role: 'assistant', text: msg, ai: true }])
    } finally { setBusy(false) }
  }

  return (
    <>
      <button style={fab} title="Помощник" aria-label="Помощник" onClick={() => setOpen((o) => !o)}>
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div style={panel}>
          <div style={header}>
            <span>🤖 Помощник Putevo</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#92a2d4', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <div style={disclaimer}>Отвечает ИИ — может ошибаться. По спорному вопросу обращайтесь к поддержке.</div>
          <div style={body}>
            {msgs.length === 0 && (
              <div style={{ color: '#92a2d4', fontSize: '0.82rem' }}>
                Спросите, как сделать что-то в сервисе. Например: «Как подключить получателя отчётов?»
                или «Что значит статус „ожидает подтверждения"?»
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={m.role === 'user' ? userMsg : aiMsg}>
                {m.ai && <div style={aiLabel}>🤖 ответ ИИ</div>}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              </div>
            ))}
            {busy && <div style={aiMsg}>…печатает</div>}
            <div ref={endRef} />
          </div>
          <div style={inputRow}>
            <textarea className="a-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ваш вопрос…" style={{ flex: 1, resize: 'none' }} disabled={busy} />
            <button className="a-btn a-btn--primary a-btn--sm" onClick={send} disabled={busy || !input.trim()}>➤</button>
          </div>
        </div>
      )}
    </>
  )
}
