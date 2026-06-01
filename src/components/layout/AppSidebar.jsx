import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  LayoutDashboard, ClipboardList, Building2,
  CalendarDays, BarChart3, Settings, LogOut, Truck, UserCog
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarMenu, SidebarMenuItem,
} from '@/components/ui/sidebar'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Сводка',        roles: null },
  { to: '/orders',   icon: ClipboardList,   label: 'Заявки',        roles: null },
  { to: '/drivers',  icon: Truck,           label: 'Водители',      roles: null },
  { to: '/clients',  icon: Building2,       label: 'Клиенты',       roles: null },
  { to: '/schedule', icon: CalendarDays,    label: 'График смен',   roles: null },
  { to: '/reports',  icon: BarChart3,       label: 'Отчёты',        roles: null },
  { to: '/users',    icon: UserCog,         label: 'Пользователи',  roles: ['director', 'admin'] },
]

const roleLabels = { admin: 'Администратор', director: 'Директор', manager: 'Менеджер' }

export default function AppSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const visible = navItems.filter(({ roles }) => !roles || roles.includes(user?.role))

  return (
    <Sidebar style={{ background: '#07192e', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Brand */}
      <SidebarHeader style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #865fff, #f48f1b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Truck size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.06em', color: '#e8ecff' }}>
              ДИСПЕТЧ<span style={{ color: '#f48f1b' }}>ЕР</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#92a2d4', marginTop: 1 }}>
              {roleLabels[user?.role]}
            </div>
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent style={{ padding: '12px 8px' }}>
        <SidebarMenu style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visible.map(({ to, icon: Icon, label }) => (
            <SidebarMenuItem key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#c4acff' : '#92a2d4',
                  background: isActive ? 'rgba(134,95,255,0.15)' : 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                  textDecoration: 'none',
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.dataset.active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.color = '#e8ecff'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.classList.contains('active')) {
                    const isAct = e.currentTarget.getAttribute('aria-current') === 'page'
                    e.currentTarget.style.background = isAct ? 'rgba(134,95,255,0.15)' : 'transparent'
                    e.currentTarget.style.color = isAct ? '#c4acff' : '#92a2d4'
                  }
                }}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {label}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        {user?.role === 'admin' && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#92a2d4', marginBottom: 6, paddingLeft: 12 }}>
              Система
            </div>
            <NavLink
              to="/settings"
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                fontSize: '0.875rem', fontWeight: isActive ? 600 : 400,
                color: isActive ? '#c4acff' : '#92a2d4',
                background: isActive ? 'rgba(134,95,255,0.15)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
                textDecoration: 'none',
              })}
            >
              <Settings size={16} />
              Настройки
            </NavLink>
          </div>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(134,95,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: '#c4acff',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e8ecff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => { logout(); navigate('/login') }}
            title="Выйти"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,70,85,0.6)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4655'; e.currentTarget.style.background = 'rgba(255,70,85,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,70,85,0.6)'; e.currentTarget.style.background = 'none' }}
          >
            <LogOut size={15} />
          </motion.button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
