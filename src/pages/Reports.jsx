import { useEffect, useMemo, useState, useCallback } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import Reconcile from '@/pages/Reconcile'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }

export default function Reports() {
  const { user } = useAuth()
  const { orders, fetchOrders } = useOrdersStore()
  const today = ymd(new Date())
  const [tab, setTab] = useState('reports')

  useEffect(() => { fetchOrders({}) }, [fetchOrders])

  // ── Нагрузка по водителям за период ──
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today)
  const [load, setLoad] = useState([])
  const [loadBusy, setLoadBusy] = useState(false)
  const fetchLoad = useCallback(async () => {
    setLoadBusy(true)
    try { const { data } = await api.get('/distribution/load', { params: { from, to } }); setLoad(data) }
    catch { setLoad([]) }
    finally { setLoadBusy(false) }
  }, [from, to])
  useEffect(() => { fetchLoad() }, [fetchLoad])
  const loadTotals = useMemo(() => load.reduce((a, r) => ({
    orders: a.orders + r.orders, trips: a.trips + r.trips, km: a.km + Number(r.km),
  }), { orders: 0, trips: 0, km: 0 }), [load])

  const stats = useMemo(() => {
    const byStatus = {}
    let doneToday = 0
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
      if (o.status === 'done' && o.done_at?.slice(0, 10) === today) doneToday++
    }
    return { total: orders.length, byStatus, doneToday }
  }, [orders, today])

  const cards = [
    ['Всего заявок', stats.total, '#865fff'],
    ['Новые', stats.byStatus.new || 0, '#f48f1b'],
    ['Выполнено сегодня', stats.doneToday, '#2ecc71'],
    ['Закрыто', stats.byStatus.closed || 0, '#92a2d4'],
  ]

  return (
    <div className="a-page">
      <div className="a-page-header no-print">
        <h2>{user?.role === 'director' ? 'Статистика' : 'Отчёты'}</h2>
      </div>

      <div className="a-tabs no-print">
        <button className={'a-tab' + (tab === 'reports' ? ' is-active' : '')} onClick={() => setTab('reports')}>Статистика и нагрузка</button>
        <button className={'a-tab' + (tab === 'recon' ? ' is-active' : '')} onClick={() => setTab('recon')}>Сверка с водителем</button>
      </div>

      {tab === 'recon' ? <Reconcile embedded /> : (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        {cards.map(([label, value, accent]) => (
          <div key={label} className="a-card">
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent }}>{value}</div>
            <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="a-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="a-section-title" style={{ margin: 0 }}>Нагрузка по водителям за период</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className="a-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
            <span className="a-muted">—</span>
            <input className="a-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          </div>
        </div>
        {loadBusy ? <div className="a-loading">Загрузка…</div> : load.length === 0 ? (
          <div className="a-empty">За период нет назначенных заявок с метриками.</div>
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr><th>Водитель</th><th>Заявок</th><th>Заезды</th><th>Км (усл.)</th><th>Балл тяжести</th></tr>
              </thead>
              <tbody>
                {load.map((r) => (
                  <tr key={r.driver_id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.orders}</td>
                    <td>{r.trips}</td>
                    <td className="a-muted">{Number(r.km).toFixed(1)}</td>
                    <td className="a-muted">{Number(r.score).toFixed(1)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', fontWeight: 700 }}>
                  <td>Итого</td>
                  <td>{loadTotals.orders}</td>
                  <td>{loadTotals.trips}</td>
                  <td>{loadTotals.km.toFixed(1)}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
          Километраж и заезды берутся из заявок на момент назначения — так видно фактическую нагрузку и кто возил «дальняк».
        </div>
      </div>

      <div className="a-card">
        <div className="a-section-title" style={{ marginTop: 0 }}>Экспорт и аналитика</div>
        <div className="a-empty">
          Выгрузка реестров (Excel/PDF) появится на следующем этапе.
        </div>
      </div>
      </>
      )}
    </div>
  )
}
