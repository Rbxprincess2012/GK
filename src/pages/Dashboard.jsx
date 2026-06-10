import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Shuffle, CheckCircle2, Users } from 'lucide-react'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useAuth } from '@/context/AuthContext'

const STATUS = {
  new: ['Новая', 'orange'], assigned: ['Назначена', 'purple'], in_progress: ['В работе', 'purple'],
  done: ['Выполнена', 'green'], closed: ['Закрыта', 'purple'], cancelled: ['Отменена', 'red'],
}
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function clientLegal(o) { return o.client_legal_name || o.client_nickname || '—' }
function streetLine(o) {
  return [o.street_name, o.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ') || o.district_alias || o.district || '—'
}
function objectLine(o) { return o.object_name || `Объект #${o.object_id}` }

function Stat({ Icon, label, value, accent, to }) {
  const body = (
    <div className="a-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}22`, color: accent }}>
        <Icon size={22} />
      </div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body
}

export default function Dashboard() {
  const { user } = useAuth()
  const { orders, fetchOrders } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const today = ymd(new Date())

  useEffect(() => { fetchOrders({}); fetchAvailable(today, 'day') }, [fetchOrders, fetchAvailable, today])

  const stats = useMemo(() => ({
    nw: orders.filter((o) => o.status === 'new').length,
    assigned: orders.filter((o) => o.status === 'assigned' || o.status === 'in_progress').length,
    doneToday: orders.filter((o) => o.status === 'done' && o.done_at?.slice(0, 10) === today).length,
  }), [orders, today])

  const recent = orders.slice(0, 8)

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Сводка</h2>
        <span className="a-muted">Привет, {user?.first_name || user?.email || 'диспетчер'} 👋</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <Stat Icon={ClipboardList} label="Новые заявки" value={stats.nw} accent="#f48f1b" to="/distribution" />
        <Stat Icon={Shuffle} label="В работе" value={stats.assigned} accent="#865fff" to="/orders" />
        <Stat Icon={CheckCircle2} label="Выполнено сегодня" value={stats.doneToday} accent="#2ecc71" to="/orders" />
        <Stat Icon={Users} label="На смене (день)" value={available.length} accent="#c4acff" to="/schedule" />
      </div>

      <div className="a-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="a-section-title" style={{ margin: 0 }}>Последние заявки</div>
          <Link to="/orders" className="a-muted" style={{ fontSize: '0.82rem' }}>Все →</Link>
        </div>
        <table className="a-table" style={{ marginTop: 10 }}>
          <thead><tr><th>№</th><th>Улица</th><th>Объект</th><th>Заказчик</th><th>Статус</th></tr></thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 700 }}>#{o.number}</td>
                <td style={{ fontWeight: 600 }}>{streetLine(o)}</td>
                <td className="a-muted">{objectLine(o)}</td>
                <td className="a-muted">{clientLegal(o)}</td>
                <td><span className={`a-badge a-badge--${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0]}</span></td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} className="a-loading">Заявок пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
