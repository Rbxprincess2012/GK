import { useState, useEffect } from 'react'
import { Printer, FileCheck2 } from 'lucide-react'
import { useOrdersStore } from '@/store/ordersStore'
import { useDriversStore } from '@/store/driversStore'
import { useToast } from '@/components/admin/Toast'
import { clientLegal, streetLine, objectLine, isCash, fmtMoney } from '@/lib/orderUi'

const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
// Сверяем исполненные заявки.
const RECON_STATUSES = 'done,closed'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function dateLabelFull(d10) {
  const [y, m, dd] = d10.split('-').map(Number)
  return `${dd} ${MON_GEN[m - 1]} ${y} г., ${DOW[new Date(y, m - 1, dd).getDay()]}`
}

// «Сверка с водителем»: менеджер выбирает водителя и период → по исполненным заявкам
// формируются ведомости (одна на каждый день) с полями Улица / Объект / Заказчик → печать.
export default function Reconcile({ embedded = false }) {
  const { queryOrders } = useOrdersStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const toast = useToast()

  const firstOfMonth = () => { const d = new Date(); d.setDate(1); return ymd(d) }
  const [driverId, setDriverId] = useState('')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(ymd(new Date()))
  const [sheets, setSheets] = useState(null) // null = ещё не формировали
  const [meta, setMeta] = useState(null)     // зафиксированные водитель/период на момент формирования
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchDrivers() }, [fetchDrivers])

  const activeDrivers = drivers
    .filter((d) => d.is_active)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))

  const build = async () => {
    if (!driverId || !from || !to) return
    if (from > to) { toast.error('Начало периода позже конца'); return }
    setLoading(true)
    try {
      const rows = await queryOrders({ assigned_driver_id: driverId, shift_from: from, shift_to: to, statuses: RECON_STATUSES })
      const m = {}
      for (const o of rows) { const k = o.shift_date?.slice(0, 10) || '—'; (m[k] ||= []).push(o) }
      const days = Object.keys(m).sort().map((date) => ({ date, list: m[date] }))
      const drv = drivers.find((d) => d.id === Number(driverId))
      setMeta({ driver: drv, from, to, total: rows.length })
      setSheets(days)
      if (days.length === 0) toast.info('За период нет исполненных заявок у этого водителя')
    } catch { toast.error('Не удалось сформировать ведомость') }
    finally { setLoading(false) }
  }

  const content = (
    <>
      {/* Панель параметров */}
      <div className="a-card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="a-field" style={{ width: 220 }}><span>Водитель *</span>
            <select className="a-select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">— выберите водителя —</option>
              {activeDrivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="a-field"><span>Период с *</span>
            <input className="a-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
          </label>
          <label className="a-field"><span>по *</span>
            <input className="a-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
          </label>
          <button className="a-btn a-btn--primary" onClick={build} disabled={!driverId || loading}>
            <FileCheck2 size={16} /> {loading ? 'Формирую…' : 'Сформировать'}
          </button>
          {sheets && sheets.length > 0 && (
            <button className="a-btn a-btn--success" onClick={() => window.print()}>
              <Printer size={16} /> На печать
            </button>
          )}
        </div>
        <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          Каждый день периода — отдельная ведомость. В печать уходят только ведомости (без меню и панели).
        </div>
      </div>

      {sheets === null && (
        <div className="a-card no-print"><div className="a-empty">Выберите водителя и период, затем нажмите «Сформировать».</div></div>
      )}
      {sheets && sheets.length === 0 && (
        <div className="a-card no-print"><div className="a-empty">
          За период {meta?.from} — {meta?.to} у водителя {meta?.driver?.name} нет исполненных заявок.
        </div></div>
      )}

      {/* Ведомости (печатаемая область) */}
      {sheets && sheets.length > 0 && (
        <div className="recon-print">
          {sheets.map(({ date, list }) => (
            <div key={date} className="recon-sheet">
              <div className="recon-head">
                <div>
                  <div className="recon-title">Ведомость сверки исполненных заявок</div>
                  <div className="recon-sub">{dateLabelFull(date)}</div>
                </div>
                <div className="recon-driver">
                  <div><b>Водитель:</b> {meta?.driver?.name || '—'}</div>
                  {meta?.driver?.default_vehicle_id && <div><b>Машина:</b> №{meta.driver.default_vehicle_id}</div>}
                  <div><b>Заявок:</b> {list.length}</div>
                </div>
              </div>

              {(() => {
                const cashTotal = list.reduce((s, o) => s + (isCash(o) ? Number(o.amount) || 0 : 0), 0)
                const tripsTotal = list.reduce((s, o) => s + (Number(o.trips) || 0), 0)
                return (
                  <table className="recon-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>№</th>
                        <th style={{ width: 64 }}>Заказ</th>
                        <th>Заказчик</th>
                        <th>Объект</th>
                        <th>Улица</th>
                        <th style={{ width: 64 }}>Рейсы</th>
                        <th style={{ width: 150 }}>Оплата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o, i) => (
                        <tr key={o.id}>
                          <td>{i + 1}</td>
                          <td>{o.number ? `#${o.number}` : '—'}</td>
                          <td>{clientLegal(o)}</td>
                          <td>{objectLine(o)}</td>
                          <td>{streetLine(o)}</td>
                          <td style={{ textAlign: 'center' }}>{o.trips != null ? o.trips : '—'}</td>
                          <td className={isCash(o) ? 'recon-cash' : ''}>
                            {isCash(o)
                              ? `Нал — ${o.amount != null ? fmtMoney(o.amount) : '____ ₽'}`
                              : 'Безнал'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Итого рейсов за день:</td>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{tripsTotal}</td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Итого получено наличными за день:</td>
                        <td className="recon-cash" style={{ fontWeight: 800 }}>{fmtMoney(cashTotal) || '0 ₽'}</td>
                      </tr>
                    </tfoot>
                  </table>
                )
              })()}

              <div className="recon-sign">
                <div>Водитель: ______________________ / {meta?.driver?.name || ''}</div>
                <div>Менеджер: ______________________ /</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) return content
  return (
    <div className="a-page">
      <div className="a-page-header no-print">
        <h2>Сверка с водителем</h2>
      </div>
      {content}
    </div>
  )
}
