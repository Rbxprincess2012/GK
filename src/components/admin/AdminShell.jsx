import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { Truck, LogOut, SlidersHorizontal, RotateCcw, Check } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { DEFAULT_LAYOUT, isValidKey } from './navConfig'
import { loadLayout, saveLayout } from '@/lib/navLayout'
import { useHeartbeat } from '@/lib/useHeartbeat'
import { SidebarNav, SidebarNavEditor } from './SidebarNav'
import { AssistantWidget } from './AssistantWidget'

const COLLAPSED = 56
const EXPANDED = 220

const roleLabels = { superuser: 'Суперпользователь', director: 'Директор', manager: 'Менеджер' }
const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_LAYOUT))

const SWITCH_ROLES = ['superuser', 'director', 'manager']

export default function AdminShell() {
  const { user, logout, isSuperuser, viewRole, setViewRole } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [layout, setLayout] = useState(() => loadLayout(DEFAULT_LAYOUT, isValidKey))

  // Журнал посещений: heartbeat активной сессии, пока открыт рабочий кабинет.
  useHeartbeat()

  // Сохраняем раскладку при изменении (кроме первого рендера — там она уже из хранилища).
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) saveLayout(layout)
    else mounted.current = true
  }, [layout])

  // В режиме редактирования сайдбар закреплён раскрытым.
  const isExpanded = expanded || editMode

  return (
    <div className="a-shell">
      <motion.aside
        className="a-sidebar"
        initial={false}
        animate={{ width: isExpanded ? EXPANDED : COLLAPSED }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => { if (!editMode) setExpanded(false) }}
      >
        <div className="a-brand">
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #f7a233, #d97a0e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Truck size={16} color="#fff" />
          </div>
          {isExpanded && (
            <div style={{ marginLeft: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#e8ecff', whiteSpace: 'nowrap' }}>
              ДИСПЕТЧ<span style={{ color: '#f48f1b' }}>ЕР</span>
            </div>
          )}
        </div>

        {editMode
          ? <SidebarNavEditor layout={layout} setLayout={setLayout} user={user} />
          : <SidebarNav expanded={isExpanded} setExpanded={setExpanded} layout={layout} user={user} pathname={pathname} />}

        {isExpanded && (editMode ? (
          <div className="a-edit-actions">
            <button className="a-editbtn" onClick={() => setLayout(cloneDefault())} title="Вернуть стандартную раскладку">
              <RotateCcw size={15} /> Сбросить
            </button>
            <button className="a-editbtn a-editbtn--done" onClick={() => setEditMode(false)}>
              <Check size={15} /> Готово
            </button>
          </div>
        ) : (
          <button className="a-editbtn a-editbtn--enter" onClick={() => { setEditMode(true); setExpanded(true) }}>
            <SlidersHorizontal size={15} /> Настроить меню
          </button>
        ))}

        {!editMode && (
          <button className="a-nav-item a-nav-item--logout" onClick={() => { logout(); navigate('/login') }}>
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {isExpanded && <span className="a-nav-label">Выйти</span>}
          </button>
        )}
      </motion.aside>

      <div className="a-main-wrap">
        <div className="a-topbar">
          <span style={{ fontSize: '0.82rem', color: '#92a2d4' }}>
            {[user?.last_name, user?.first_name].filter(Boolean).join(' ') || user?.email} · {roleLabels[user?.role]}
          </span>
          {isSuperuser && (
            <div className="a-roleswitch" title="Просмотр интерфейса в роли (только вид; права в API остаются суперпользователя)">
              <span className="a-roleswitch-label">Смотреть как:</span>
              {SWITCH_ROLES.map((r) => (
                <button
                  key={r}
                  className={'a-roleswitch-btn' + ((viewRole || 'superuser') === r ? ' is-active' : '')}
                  onClick={() => setViewRole(r)}
                >
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          )}
        </div>
        <main className="a-main">
          <Outlet />
        </main>
      </div>
      <AssistantWidget />
    </div>
  )
}
