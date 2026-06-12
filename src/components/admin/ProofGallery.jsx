import { useState } from 'react'

// Одно вложение пруфа: фото (клик → новая вкладка), видео, голос или текст.
export function Attachment({ a }) {
  const box = { width: '100%', height: 96, objectFit: 'cover', borderRadius: 8, background: '#000', display: 'block' }
  if (a.kind === 'video') return <video src={a.file_url} controls preload="metadata" style={box} />
  if (a.kind === 'audio') return <audio src={a.file_url} controls style={{ width: '100%', gridColumn: '1 / -1' }} />
  if (a.kind === 'text') return <blockquote style={{ gridColumn: '1 / -1', margin: 0, padding: '6px 10px', borderLeft: '3px solid #6c5ce7', color: '#cdd6ff' }}>{a.transcript}</blockquote>
  if (!a.file_url) return <span className="a-muted" style={{ fontSize: '0.74rem' }}>загрузка…</span>
  return <a href={a.file_url} target="_blank" rel="noreferrer"><img src={a.file_url} loading="lazy" alt="пруф" style={box} /></a>
}

// Галерея пруфов одной под-задачи + модерация (принять / вернуть на переделку с комментарием).
export function ProofGallery({ subtask, onAccept, onReject, busy }) {
  const st = subtask
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')

  const badge = st.proof_status === 'accepted'
    ? <span className="a-badge a-badge--green">✅ принято</span>
    : st.proof_status === 'rejected'
      ? <span className="a-badge a-badge--red">↩ возвращено</span>
      : <span className="a-badge a-badge--orange">⏳ на проверке</span>
  const atts = st.attachments || []

  return (
    <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b style={{ color: '#e8ecff' }}>{st.section_name || 'Объект'}</b>
        <span className="a-muted" style={{ fontSize: '0.78rem' }}>№{st.sub_no}</span>
        <span style={{ marginLeft: 'auto' }}>{badge}</span>
      </div>

      {atts.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, marginBottom: 8 }}>
          {atts.map((a) => <Attachment key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 8 }}>
          {st.status === 'done' ? 'Пруфов нет (водитель не приложил).' : 'Участок ещё не выполнен.'}
        </div>
      )}

      {st.status === 'done' && st.proof_status !== 'accepted' && (
        rejecting ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label className="a-field" style={{ flex: 1 }}><span>Что переснять</span>
              <input className="a-input" value={comment} autoFocus
                onChange={(e) => setComment(e.target.value)} placeholder="напр.: не видно номер контейнера" />
            </label>
            <button className="a-btn a-btn--danger a-btn--sm" disabled={!comment.trim() || busy}
              onClick={() => { onReject(st.id, comment.trim()); setRejecting(false); setComment('') }}>Вернуть</button>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setRejecting(false)}>Отмена</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="a-btn a-btn--success a-btn--sm" disabled={busy} onClick={() => onAccept(st.id)}>✅ Принять</button>
            <button className="a-btn a-btn--ghost a-btn--sm" disabled={busy} onClick={() => setRejecting(true)}>↩ Вернуть на переделку</button>
          </div>
        )
      )}
    </div>
  )
}
