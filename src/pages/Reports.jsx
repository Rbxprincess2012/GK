import { useEffect, useMemo } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useAuth } from '@/context/AuthContext'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function Reports() {
  const { user } = useAuth()
  const { orders, fetchOrders } = useOrdersStore()
  const today = ymd(new Date())

  useEffect(() => { fetchOrders({}) }, [fetchOrders])

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
      <div className="a-page-header">
        <h2>{user?.role === 'director' ? 'Статистика' : 'Отчёты'}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        {cards.map(([label, value, accent]) => (
          <div key={label} className="a-card">
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent }}>{value}</div>
            <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="a-card">
        <div className="a-section-title" style={{ marginTop: 0 }}>Экспорт и аналитика</div>
        <div className="a-empty">
          Выгрузка реестров (Excel/PDF) и подробная аналитика по водителям, районам и топливу появятся на следующем этапе.
        </div>
      </div>
    </div>
  )
}
