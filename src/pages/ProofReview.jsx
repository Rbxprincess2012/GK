import { useEffect, useState, useCallback, useMemo } from 'react'
import { useProofReviewStore } from '@/store/proofReviewStore'
import { useDriversStore } from '@/store/driversStore'
import { useOrdersStore } from '@/store/ordersStore'
import { OrderModal } from '@/components/admin/OrderModal'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { clientLegal, objectLine, streetLine, fmtDesiredTime } from '@/lib/orderUi'

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function dateLabel(d10) {
  if (!d10) return 'Без даты заезда'
  const [y, m, dd] = d10.split('-').map(Number)
  return `${dd} ${MON[m - 1]}, ${DOW[new Date(y, m - 1, dd).getDay()]}`
}

function fmtRu(d10) {
  if (!d10) return '—'
  const [y, m, dd] = d10.slice(0, 10).split('-')
  return `${dd}.${m}.${y}`
}

// Текст решения менеджера по участку (правый столбец).
function decision(s) {
  if (s.outcome === 'accepted') return ['принято', 'ok']
  if (s.outcome === 'done') return ['ожидает приёмки', 'wait']
  if (s.outcome === 'reassigned') {
    const t = fmtDesiredTime(s.desired_time) || 'как можно быстрее'
    return [`переназначена на ${fmtRu(s.shift_date || s.desired_date)} под №${s.child_number} · 🕐 ${t}${s.driver_name ? ` · ${s.driver_name}` : ''}`, 'move']
  }
  if (s.outcome === 'left_in_pool') return [`отправлена в Заявки в работе под №${s.child_number}`, 'move']
  return ['ожидает решения', 'wait']
}

// Раздел «Проверка» = история проверки пруфов. Активные (ждут подтверждения) сверху,
// завершённые (Принят заказ) — серыми ниже. Группировка по дате заезда. Клик → модалка.
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
  const isActive = (o) => o.status === 'awaiting_confirmation'
  const activeCount = queue.filter(isActive).length

  // Группировка по дате заезда (свежие сверху); внутри — активные выше завершённых.
  const groups = useMemo(() => {
    const m = {}
    for (const o of queue) { const k = o.desired_date?.slice(0, 10) || ''; (m[k] ||= []).push(o) }
    return Object.keys(m)
      .sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a)))
      .map((d) => ({
        date: d,
        list: m[d].sort((a, b) => (isActive(b) ? 1 : 0) - (isActive(a) ? 1 : 0) || (b.number || 0) - (a.number || 0)),
      }))
  }, [queue])

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Проверка <span className="a-count">{activeCount}</span></h2>
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
        <div className="a-empty">Нет заявок на проверке.</div>
      ) : groups.map(({ date: d, list }) => (
        <div key={d || 'none'} className="a-proof-group">
          <div className="a-proof-date">{dateLabel(d)}</div>
          {list.map((o) => {
            const obj = objectLine(o)
            const nick = (o.client_nickname || '').trim()
            const showClient = !(nick && obj.toLowerCase().includes(nick.toLowerCase()))
            return (
              <div key={o.id} className={'a-card a-proof-row' + (isActive(o) ? '' : ' a-proof-row--closed')}
                onClick={() => openDetail(o)} title="Открыть отчёт">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <b style={{ color: '#e8ecff' }}>Заявка №{o.number}</b>
                  <DesiredTime time={o.desired_time} />
                  <span className="a-muted">🚛 {o.driver_name || '—'}{o.veh_gov ? ` · ${o.veh_gov}` : ''}</span>
                  {!isActive(o) && <span className="a-proof-closed-tag">принят</span>}
                </div>
                <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 8 }}>
                  {[showClient && clientLegal(o), obj, streetLine(o)].filter(Boolean).join(' · ')}
                </div>
                <div className="a-proof-secs">
                  {(o.review_sections || []).map((s, i) => {
                    const [dtext, dkind] = decision(s)
                    return (
                      <div key={i} className="a-proof-sec">
                        <span className="a-proof-sec-name">📍 {s.section_name}</span>
                        <span className={'a-proof-sec-done ' + (s.done ? 'is-ok' : 'is-no')}>{s.done ? 'выполнено' : 'не выполнено'}</span>
                        <span className={'a-proof-sec-res a-pd-' + dkind}>{dtext}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {detail && (
        <OrderModal order={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload() }} />
      )}
    </div>
  )
}
