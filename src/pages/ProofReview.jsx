import { useEffect, useState, useCallback } from 'react'
import { useProofReviewStore } from '@/store/proofReviewStore'
import { useDriversStore } from '@/store/driversStore'
import { useOrdersStore } from '@/store/ordersStore'
import { OrderModal } from '@/components/admin/OrderModal'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { clientLegal, objectLine, streetLine } from '@/lib/orderUi'

// Лента-очередь проверки: краткий статус по участкам. Клик по заявке → единая
// модалка (OrderModal) с отчётом (фото/текст) и приёмкой/переназначением.
export default function ProofReview() {
  const { queue, loading, fetchQueue } = useProofReviewStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const { getOrder } = useOrdersStore()
  const [date, setDate] = useState('')
  const [driverId, setDriverId] = useState('')
  const [detail, setDetail] = useState(null)

  const reload = useCallback(
    () => fetchQueue({ ...(date ? { date } : {}), ...(driverId ? { driver_id: driverId } : {}) }),
    [fetchQueue, date, driverId],
  )
  useEffect(() => { fetchDrivers() }, [fetchDrivers])
  useEffect(() => { reload() }, [reload])

  const openDetail = async (o) => { const full = await getOrder(o.id); setDetail({ ...o, ...full }) }

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
        // Не дублируем заказчика, если имя объекта уже содержит его (напр. «ГринСервис · Кафе»).
        const obj = objectLine(o)
        const nick = (o.client_nickname || '').trim()
        const showClient = !(nick && obj.toLowerCase().includes(nick.toLowerCase()))
        return (
        <div key={o.id} className="a-card a-proof-row" style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => openDetail(o)} title="Открыть отчёт">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <b style={{ color: '#e8ecff' }}>Заявка №{o.number}</b>
            <DesiredTime time={o.desired_time} />
            <span className="a-muted">🚛 {o.driver_name || '—'}{o.veh_gov ? ` · ${o.veh_gov}` : ''}</span>
          </div>
          <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 8 }}>
            {[showClient && clientLegal(o), obj, streetLine(o)].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(o.subtasks || []).map((s) => (
              <div key={s.id} style={{ fontSize: '0.86rem' }}>
                📍 {s.section_name || 'Объект целиком'} — {s.status === 'done'
                  ? <span style={{ color: '#2ecc71' }}>выполнено</span>
                  : <span style={{ color: '#ff8f8f' }}>не выполнено</span>}
              </div>
            ))}
          </div>
        </div>
        )
      })}

      {detail && (
        <OrderModal order={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload() }} />
      )}
    </div>
  )
}
