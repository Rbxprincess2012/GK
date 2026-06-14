import { useState, useEffect, useCallback, useMemo } from 'react'
import { Mic, FileText, AlertTriangle } from 'lucide-react'
import { useDraftsStore } from '@/store/draftsStore'
import { useObjectsStore } from '@/store/objectsStore'
import { Modal } from '@/components/admin/Modal'
import { ItemsEditor } from '@/components/admin/ItemsEditor'
import { DateField } from '@/components/admin/DateField'
import { useToast } from '@/components/admin/Toast'

const emptyItem = { action: 'haul', quantity: 1 }
const isUrgent = (t) => /срочн|кровь из носу|сегодня|asap/i.test(t || '')

function objName(o) {
  if (!o) return ''
  return o.informal_name || [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ') || `#${o.id}`
}

export default function Inbox() {
  const { drafts, fetchDrafts } = useDraftsStore()
  const { objects, fetchAll } = useObjectsStore()
  const [active, setActive] = useState(null)

  const refresh = useCallback(() => fetchDrafts(), [fetchDrafts])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Входящие <span className="a-count">{drafts.length}</span></h2>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th></th><th>Клиент</th><th>Адрес (подсказка)</th><th>Желаемая дата</th><th>Задание</th><th></th></tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setActive(d)}>
                <td title={d.source_kind === 'voice' ? 'Голосовое' : 'Текст'}>
                  {d.source_kind === 'voice' ? <Mic size={15} className="a-muted" /> : <FileText size={15} className="a-muted" />}
                </td>
                <td>{d.client_nickname || d.client_legal_name || <span className="a-muted">—</span>}</td>
                <td className="a-muted">{d.object_name || d.object_hint || '—'}</td>
                <td className="a-muted">{d.desired_date?.slice(0, 10) || '—'}{d.desired_time ? ` ${d.desired_time.slice(0, 5)}` : ''}</td>
                <td style={{ maxWidth: 360 }}>
                  {isUrgent(d.task_text) && <span className="a-badge a-badge--red" style={{ marginRight: 6 }}>срочно</span>}
                  {d.task_text}
                </td>
                <td>{d.ambiguities?.length ? <AlertTriangle size={15} style={{ color: '#f48f1b' }} title={d.ambiguities.join('; ')} /> : null}</td>
              </tr>
            ))}
            {drafts.length === 0 && <tr><td colSpan={6} className="a-loading">Входящих нет</td></tr>}
          </tbody>
        </table>
      </div>

      {active && (
        <ReviewDraft
          draft={active} objects={objects}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Согласование черновика менеджером ──
function ReviewDraft({ draft, objects, onClose, onDone }) {
  const { promote, reject } = useDraftsStore()
  const toast = useToast()
  const [form, setForm] = useState({
    object_id: draft.object_id || '',
    payment_method: '',
    desired_date: draft.desired_date?.slice(0, 10) || '',
    desired_time: draft.desired_time?.slice(0, 5) || '',
    note: draft.task_text || '',
  })
  const [items, setItems] = useState([{ ...emptyItem }])
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Объекты этого клиента (если канал привязан к клиенту), иначе — все.
  const clientObjects = useMemo(
    () => (draft.client_id ? objects.filter((o) => o.client_id === draft.client_id) : objects),
    [objects, draft.client_id],
  )
  // Участки выбранного объекта — для привязки позиций.
  const sections = useMemo(
    () => clientObjects.find((o) => o.id === Number(form.object_id))?.sections || [],
    [clientObjects, form.object_id],
  )

  const valid = form.object_id && items.every((it) => it.quantity > 0)

  const doPromote = async () => {
    setBusy(true)
    const payload = {
      object_id: Number(form.object_id),
      items: items.map((it) => ({ action: it.action, quantity: Number(it.quantity), section_id: it.section_id ? Number(it.section_id) : null })),
      ...(form.payment_method ? { payment_method: form.payment_method } : {}),
      ...(form.desired_date ? { desired_date: form.desired_date } : {}),
      ...(form.desired_time ? { desired_time: form.desired_time } : {}),
      ...(form.note ? { note: form.note } : {}),
    }
    try { const o = await promote(draft.id, payload); toast.success(`Заявка №${o.number} создана`); onDone() }
    catch { toast.error('Не удалось провести заявку'); setBusy(false) }
  }

  const doReject = async () => {
    setBusy(true)
    try { await reject(draft.id, reason); toast.success('Черновик отклонён'); onDone() }
    catch { toast.error('Ошибка отклонения'); setBusy(false) }
  }

  return (
    <Modal
      title="Согласование заявки" onClose={onClose} width={600}
      footer={rejecting ? <>
        <button className="a-btn a-btn--ghost" onClick={() => setRejecting(false)} disabled={busy}>Назад</button>
        <button className="a-btn a-btn--danger" onClick={doReject} disabled={busy}>Подтвердить отклонение</button>
      </> : <>
        <button className="a-btn a-btn--ghost" onClick={() => setRejecting(true)} disabled={busy}>Отклонить</button>
        <button className="a-btn a-btn--primary" onClick={doPromote} disabled={!valid || busy}>Принять</button>
      </>}
    >
      {/* Контекст от клиента */}
      <div className="a-callout" style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(244,143,27,0.08)', border: '1px solid rgba(244,143,27,0.18)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f9b35a', marginBottom: 4 }}>
          Задание (от клиента){isUrgent(draft.task_text) && <span className="a-badge a-badge--red" style={{ marginLeft: 8 }}>срочно</span>}
        </div>
        <div style={{ fontSize: '0.9rem' }}>{draft.task_text}</div>
        {draft.raw_message && (
          <details style={{ marginTop: 8 }}>
            <summary className="a-muted" style={{ cursor: 'pointer', fontSize: '0.78rem' }}>Исходное сообщение</summary>
            <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4, whiteSpace: 'pre-wrap' }}>{draft.raw_message}</div>
          </details>
        )}
        {draft.ambiguities?.length > 0 && (
          <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#f4b51b' }}>
            <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Уточнить: {draft.ambiguities.join('; ')}
          </div>
        )}
      </div>

      {rejecting ? (
        <label className="a-field"><span>Причина отклонения (необязательно)</span>
          <input className="a-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="напр. не наш клиент / спам" autoFocus />
        </label>
      ) : (
        <>
          <label className="a-field"><span>Объект *{draft.object_hint && <span className="a-muted"> · подсказка: {draft.object_hint}</span>}</span>
            <select className="a-select" value={form.object_id} onChange={(e) => setForm({ ...form, object_id: e.target.value })}>
              <option value="">— выберите объект —</option>
              {clientObjects.map((o) => (
                <option key={o.id} value={o.id}>{(o.client_nickname || o.client_legal_name)} · {objName(o)}</option>
              ))}
            </select>
          </label>

          <div className="a-section-title">Позиции</div>
          <ItemsEditor items={items} onChange={setItems} sections={sections} />

          <div className="a-section-title">Детали</div>
          <div className="a-field-row">
            <label className="a-field"><span>Желаемая дата</span>
              <DateField value={form.desired_date} onChange={(v) => setForm({ ...form, desired_date: v })} style={{ width: '100%' }} />
            </label>
            <label className="a-field"><span>Время</span>
              <input className="a-input" type="time" value={form.desired_time} onChange={(e) => setForm({ ...form, desired_time: e.target.value })} />
            </label>
            <label className="a-field"><span>Оплата</span>
              <select className="a-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="">Как у клиента</option>
                <option value="cashless">Безнал</option><option value="cash">Нал</option>
              </select>
            </label>
          </div>
          <label className="a-field"><span>Примечание для водителя</span>
            <input className="a-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </>
      )}
    </Modal>
  )
}
