import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  LayoutDashboard, Inbox, Shuffle, ClipboardList, ClipboardCheck, PackageCheck, FileCheck2, Archive, Building2, MapPin,
  Container, User, Truck, CalendarDays, BarChart3, UserCog, Settings, LogOut, Map, Camera,
  Layers, Library, ShieldCheck, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const COLLAPSED = 56
const EXPANDED = 220

// Двухуровневая навигация: основные разделы (Заявки, Справочник, Система) —
// раскрывающиеся аккордеоны с вложенными пунктами. Сводка и Отчёты — обычные ссылки.
// В свёрнутом сайдбаре видны только иконки основных разделов.
const NAV = [
  { to: '/', label: 'Сводка', Icon: LayoutDashboard, end: true },
  {
    key: 'orders', label: 'Заявки', Icon: Layers,
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
    ],
  },
  { to: '/reports', label: 'Отчёты', Icon: BarChart3 },
  {
    key: 'refs', label: 'Справочник', Icon: Library,
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
    key: 'system', label: 'Система', Icon: ShieldCheck, bottom: true,
    items: [
      { to: '/users', label: 'Пользователи', Icon: UserCog, roles: ['director', 'superuser'] },
      { to: '/settings', label: 'Настройки', Icon: Settings, roles: ['manager', 'director', 'superuser'] },
    ],
  },
]

const roleLabels = { superuser: 'Суперпользователь', director: 'Директор', manager: 'Менеджер' }

// Ключ основного раздела, которому принадлежит путь (для авто-раскрытия активного).
function sectionOfPath(pathname) {
  for (const e of NAV) {
    if (e.items && e.items.some((i) => i.to === pathname)) return e.key
  }
  return null
}

export default function AdminShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(false)
  // openKeys хранит ТОЛЬКО явные действия пользователя (true/false). Раздел без записи
  // открыт по умолчанию, если содержит активную страницу (см. isOpen ниже) — так при
  // переходе нужный раздел раскрывается сам, без эффектов и каскадных ре-рендеров.
  const [openKeys, setOpenKeys] = useState({})
  const activeKey = sectionOfPath(pathname)
  const isOpen = (entry) => openKeys[entry.key] ?? (entry.key === activeKey)

  const visible = (n) => !n.roles || n.roles.includes(user?.role)
  const tree = NAV
    .map((e) => (e.items ? { ...e, items: e.items.filter(visible) } : e))
    .filter((e) => (e.items ? e.items.length > 0 : visible(e)))

  const toggleSection = (entry) => {
    if (!expanded) {
      // В свёрнутом виде клик по иконке раздела разворачивает сайдбар и открывает раздел.
      setExpanded(true)
      setOpenKeys((o) => ({ ...o, [entry.key]: true }))
    } else {
      setOpenKeys((o) => ({ ...o, [entry.key]: !isOpen(entry) }))
    }
  }

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
          {tree.map((entry) => {
            // Обычная ссылка (Сводка, Отчёты)
            if (!entry.items) {
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.end}
                  title={!expanded ? entry.label : undefined}
                  className={({ isActive }) => 'a-nav-item' + (isActive ? ' active' : '')}
                >
                  <entry.Icon size={18} style={{ flexShrink: 0 }} />
                  {expanded && <span className="a-nav-label">{entry.label}</span>}
                </NavLink>
              )
            }

            // Раскрывающийся основной раздел
            const open = isOpen(entry)
            const hasActive = entry.items.some((i) => i.to === pathname)
            const headActive = hasActive && (!expanded || !open)
            return (
              <div
                key={entry.key}
                className={'a-nav-section' + (entry.bottom ? ' a-nav-section--bottom' : '')}
              >
                <button
                  type="button"
                  title={!expanded ? entry.label : undefined}
                  onClick={() => toggleSection(entry)}
                  className={'a-nav-item a-nav-head' + (headActive ? ' active' : '')}
                >
                  <entry.Icon size={18} style={{ flexShrink: 0 }} />
                  {expanded && (
                    <>
                      <span className="a-nav-label">{entry.label}</span>
                      <ChevronDown size={15} className={'a-chev' + (open ? ' a-chev--open' : '')} />
                    </>
                  )}
                </button>
                {expanded && open && (
                  <div className="a-nav-children">
                    {entry.items.map(({ to, label, Icon, end }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) => 'a-nav-item a-nav-child' + (isActive ? ' active' : '')}
                      >
                        <Icon size={16} style={{ flexShrink: 0 }} />
                        <span className="a-nav-label">{label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <button className="a-nav-item a-nav-item--logout" onClick={() => { logout(); navigate('/login') }}>
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {expanded && <span className="a-nav-label">Выйти</span>}
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
