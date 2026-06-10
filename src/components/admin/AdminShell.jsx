import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  LayoutDashboard, Inbox, Shuffle, ClipboardList, ClipboardCheck, PackageCheck, FileCheck2, Archive, Building2, MapPin,
  Container, User, Truck, CalendarDays, BarChart3, UserCog, Settings, LogOut, Map, Camera,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const COLLAPSED = 56
const EXPANDED = 220

// Навигация делится на смысловые группы:
//  • Работа — ежедневный поток заявок (вверху, без заголовка)
//  • Справочники — библиотеки сущностей (клиенты, объекты, водители…)
//  • Система — администрирование (только директор/суперпользователь)
const NAV = [
  {
    items: [
      { to: '/incoming', label: 'Входящие', Icon: Inbox },
      { to: '/orders', label: 'Заявки в работе', Icon: ClipboardList },
      { to: '/distribution', label: 'Распределение', Icon: Shuffle },
      { to: '/map', label: 'Карта смены', Icon: Map },
      { to: '/review', label: 'На проверке', Icon: ClipboardCheck },
      { to: '/inwork', label: 'В работе', Icon: PackageCheck },
      { to: '/proof-review', label: 'Проверка пруфов', Icon: Camera, roles: ['manager', 'director', 'superuser'] },
      { to: '/reconcile', label: 'Сверка с водителем', Icon: FileCheck2 },
      { to: '/journal', label: 'Журнал', Icon: Archive },
      { to: '/reports', label: 'Отчёты', Icon: BarChart3 },
      { to: '/', label: 'Сводка', Icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Справочники',
    items: [
      { to: '/clients', label: 'Клиенты', Icon: Building2 },
      { to: '/objects', label: 'Объекты', Icon: MapPin },
      { to: '/containers', label: 'Контейнеры', Icon: Container },
      { to: '/drivers', label: 'Водители', Icon: User },
      { to: '/vehicles', label: 'Машины', Icon: Truck },
      { to: '/schedule', label: 'График', Icon: CalendarDays },
    ],
  },
  {
    label: 'Система',
    bottom: true,
    items: [
      { to: '/users', label: 'Пользователи', Icon: UserCog, roles: ['director', 'superuser'] },
      { to: '/settings', label: 'Настройки', Icon: Settings, roles: ['manager', 'director', 'superuser'] },
    ],
  },
]

const roleLabels = { superuser: 'Суперпользователь', director: 'Директор', manager: 'Менеджер' }

export default function AdminShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const groups = NAV
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || n.roles.includes(user?.role)) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="a-shell">
      <motion.aside
        className="a-sidebar"
        initial={false}
        animate={{ width: expanded ? EXPANDED : COLLAPSED }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="a-brand">
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #865fff, #f48f1b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Truck size={16} color="#fff" />
          </div>
          {expanded && (
            <div style={{ marginLeft: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#e8ecff', whiteSpace: 'nowrap' }}>
              ДИСПЕТЧ<span style={{ color: '#f48f1b' }}>ЕР</span>
            </div>
          )}
        </div>

        <nav className="a-nav">
          {groups.map((group, gi) => (
            <div key={gi} className={'a-nav-group' + (group.bottom ? ' a-nav-group--bottom' : '')}>
              {group.label && (
                expanded
                  ? <div className="a-nav-group-label">{group.label}</div>
                  : <div className="a-nav-sep" />
              )}
              {group.items.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => 'a-nav-item' + (isActive ? ' active' : '')}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  {expanded && <span style={{ marginLeft: 12, whiteSpace: 'nowrap' }}>{label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <button className="a-nav-item a-nav-item--logout" onClick={() => { logout(); navigate('/login') }}>
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ marginLeft: 12, whiteSpace: 'nowrap' }}>Выйти</span>}
        </button>
      </motion.aside>

      <div className="a-main-wrap">
        <div className="a-topbar">
          <span style={{ fontSize: '0.82rem', color: '#92a2d4' }}>
            {[user?.last_name, user?.first_name].filter(Boolean).join(' ') || user?.email} · {roleLabels[user?.role]}
          </span>
        </div>
        <main className="a-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
