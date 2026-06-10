import { useEffect, useState, useCallback } from 'react'
import { useProofReviewStore } from '@/store/proofReviewStore'
import { useDriversStore } from '@/store/driversStore'
import { ProofGallery } from '@/components/admin/ProofGallery'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { useToast } from '@/components/admin/Toast'
import { objectLine, streetLine } from '@/lib/orderUi'

// Лента-очередь проверки пруфов: заявки с выполненными участками, ждущими модерации.
export default function ProofReview() {
  const { queue, loading, fetchQueue, accept, reject } = useProofReviewStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [driverId, setDriverId] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(
    () => fetchQueue({ ...(date ? { date } : {}), ...(driverId ? { driver_id: driverId } : {}) }),
    [fetchQueue, date, driverId],
  )
  useEffect(() => { fetchDrivers() }, [fetchDrivers])
  useEffect(() => { reload() }, [reload])

  const onAccept = async (id) => {
    setBusy(true)
    try { await accept(id); toast.success('Пруф принят'); reload() }
    catch { toast.error('Не удалось принять') }
    finally { setBusy(false) }
  }
  const onReject = async (id, comment) => {
    setBusy(true)
    try { await reject(id, comment); toast.success('Возвращено водителю на переделку'); reload() }
    catch { toast.error('Не удалось вернуть') }
    finally { setBusy(false) }
  }
  const acceptAll = async (o) => {
    setBusy(true)
    try {
      for (const s of (o.subtasks || []).filter((s) => s.status === 'done' && s.proof_status !== 'accepted')) {
        await accept(s.id)
      }
      toast.success(`Заявка №${o.number} принята`); reload()
    } catch { toast.error('Не удалось принять заявку') }
    finally { setBusy(false) }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Проверка <span className="a-count">{queue.length}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
          <select className="a-select" value={driverId} onChange={(e) => setDriverId(e.target.value)} style={{ width: 200 }}>
            <option value="">Все водители</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="a-loading">Загрузка…</div>
      ) : queue.length === 0 ? (
        <div className="a-empty">Нет заявок, ожидающих проверки пруфов.</div>
      ) : queue.map((o) => (
        <div key={o.id} className="a-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <b style={{ color: '#e8ecff' }}>Заявка №{o.number}</b>
            <DesiredTime time={o.desired_time} />
            <span className="a-muted">{objectLine(o)} · {streetLine(o)}</span>
            {o.driver_name && <span className="a-muted">· {o.driver_name}</span>}
            <button className="a-btn a-btn--success a-btn--sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => acceptAll(o)}>
              ✅ Принять все
            </button>
          </div>
          {(o.subtasks || []).filter((s) => s.status === 'done' || s.attachments?.length).map((s) => (
            <ProofGallery key={s.id} subtask={s} onAccept={onAccept} onReject={onReject} busy={busy} />
          ))}
        </div>
      ))}
    </div>
  )
}
