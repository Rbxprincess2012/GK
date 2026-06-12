import { useEffect, useState, useCallback } from 'react'
import { useProofReviewStore } from '@/store/proofReviewStore'
import { useDriversStore } from '@/store/driversStore'
import { useOrdersStore } from '@/store/ordersStore'
import { ProofGallery } from '@/components/admin/ProofGallery'
import { OrderModal } from '@/components/admin/OrderModal'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { useToast } from '@/components/admin/Toast'
import { clientLegal, objectLine, streetLine } from '@/lib/orderUi'

// Лента-очередь проверки пруфов: заявки с выполненными участками, ждущими модерации.
export default function ProofReview() {
  const { queue, loading, fetchQueue, accept, reject } = useProofReviewStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const { getOrder } = useOrdersStore()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [driverId, setDriverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null) // заявка в единой модалке OrderModal

  const openDetail = async (o) => { const full = await getOrder(o.id); setDetail({ ...o, ...full }) }

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
      ) : queue.map((o) => {
        const subs = o.subtasks || []
        const undone = subs.filter((s) => s.status !== 'done')
        return (
          <div key={o.id} className="a-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <b style={{ color: '#e8ecff' }}>Заявка №{o.number}</b>
              <DesiredTime time={o.desired_time} />
              <span className="a-muted">{[clientLegal(o), objectLine(o), streetLine(o)].filter(Boolean).join(' · ')}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openDetail(o)}>Открыть</button>
                <button className="a-btn a-btn--success a-btn--sm" disabled={busy} onClick={() => acceptAll(o)}>✅ Принять все</button>
              </span>
            </div>
            {/* Водитель и машина — отдельной строкой (П4) */}
            <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
              🚛 {o.driver_name || '—'}{o.veh_gov ? ` · ${o.veh_gov}` : ''}
            </div>
            {/* Все участки: выполненные — с галереей пруфов; невыполненные — строкой состояния (П2) */}
            {subs.map((s) => (
              s.status === 'done' || s.attachments?.length
                ? <ProofGallery key={s.id} subtask={s} onAccept={onAccept} onReject={onReject} busy={busy} />
                : <div key={s.id} className="a-muted" style={{ padding: '6px 0', fontSize: '0.86rem' }}>
                    📍 {s.section_name || 'Объект целиком'} — <b style={{ color: '#ff8f8f' }}>не выполнен</b>{s.comment ? `: ${s.comment}` : ''}
                  </div>
            ))}
            {undone.length > 0 && (
              <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                Невыполненные участки разруливаются в окне заявки — нажмите «Открыть».
              </div>
            )}
          </div>
        )
      })}

      {detail && (
        <OrderModal order={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload() }} />
      )}
    </div>
  )
}
