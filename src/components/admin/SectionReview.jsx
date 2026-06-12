import { useState } from 'react'
import { Attachment } from './ProofGallery'

// Приёмка одного участка заявки (статус «Ожидает подтверждения»).
//  • выполненный участок (done): тоггл «Принять» (зелёная) ↔ «Принято» (серая, локально,
//    фиксируется на сервере при «Принять заказ») + «Вернуть водителю» (на пересъёмку);
//  • невыполненный участок: кнопка «Переназначить» (откроет модалку даты/водителя).
export function SectionReview({ subtask, accepted, onToggleAccept, onReject, onReassign, busy }) {
  const st = subtask
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')
  const atts = st.attachments || []
  const isDone = st.status === 'done'

  const badge = isDone
    ? (accepted
      ? <span className="a-badge a-badge--green">✅ принято</span>
      : <span className="a-badge a-badge--orange">⏳ на проверке</span>)
    : <span className="a-badge a-badge--red">✖ не выполнен</span>

  return (
    <div className="a-secrev">
      <div className="a-secrev-head">
        <b>{st.section_name || 'Объект'}</b>
        <span className="a-muted" style={{ fontSize: '0.78rem' }}>№{st.sub_no}</span>
        <span style={{ marginLeft: 'auto' }}>{badge}</span>
      </div>

      {atts.length > 0 && (
        <div className="a-secrev-grid">
          {atts.map((a) => <Attachment key={a.id} a={a} />)}
        </div>
      )}

      {isDone ? (
        rejecting ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label className="a-field" style={{ flex: 1 }}><span>Что переснять</span>
              <input className="a-input" value={comment} autoFocus
                onChange={(e) => setComment(e.target.value)} placeholder="напр.: не видно номер контейнера" />
            </label>
            <button className="a-btn a-btn--danger a-btn--sm" disabled={!comment.trim() || busy}
              onClick={() => { onReject(st.id, comment.trim()); setRejecting(false); setComment('') }}>Отправить</button>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setRejecting(false)}>Отмена</button>
          </div>
        ) : (
          <div className="a-secrev-actions">
            <button
              className={'a-btn a-btn--sm ' + (accepted ? 'a-btn--accepted' : 'a-btn--success')}
              disabled={busy}
              onClick={() => onToggleAccept(st.id)}
            >{accepted ? '✓ Принято' : 'Принять'}</button>
            <button className="a-btn a-btn--soft-danger a-btn--sm" disabled={busy} onClick={() => setRejecting(true)}>
              ↩ Вернуть водителю
            </button>
          </div>
        )
      ) : (
        <>
          {(st.comment || st.reason_code) && (
            <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Причина: {st.comment || st.reason_code}
            </div>
          )}
          <div className="a-secrev-actions">
            <button className="a-btn a-btn--primary a-btn--sm" disabled={busy} onClick={() => onReassign(st)}>
              Переназначить
            </button>
          </div>
        </>
      )}
    </div>
  )
}
