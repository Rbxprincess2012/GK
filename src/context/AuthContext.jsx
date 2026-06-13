import { createContext, useContext, useState, useEffect } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [realUser, setRealUser] = useState(null)
  const [assignableRoles, setAssignableRoles] = useState([])
  const [loading, setLoading] = useState(true)
  // «Просмотр в роли»: суперпользователь может временно смотреть UI как директор/менеджер.
  // Влияет ТОЛЬКО на видимость в интерфейсе (сайдбар/разделы). Бэк авторизует по реальному
  // токену (superuser), поэтому это превью режимов, а не настоящее ограничение прав.
  const [viewRole, setViewRoleState] = useState(() => localStorage.getItem('viewRole') || null)

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('token')
      if (!token) { setLoading(false); return }
      try {
        const { data } = await api.get('/auth/me')
        setRealUser(data.user)
        setAssignableRoles(data.assignable_roles || [])
      } catch {
        localStorage.removeItem('token')
      }
      setLoading(false)
    })()
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setRealUser(data.user)
    try {
      const me = await api.get('/auth/me')
      setAssignableRoles(me.data.assignable_roles || [])
    } catch { /* ignore */ }
    return data.user
  }

  // Включить сессию по готовому JWT (после установки пароля по приглашению).
  const activateSession = async (token) => {
    localStorage.setItem('token', token)
    const { data } = await api.get('/auth/me')
    setRealUser(data.user)
    setAssignableRoles(data.assignable_roles || [])
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('viewRole')
    setRealUser(null)
    setAssignableRoles([])
    setViewRoleState(null)
  }

  const isSuperuser = realUser?.role === 'superuser'
  const setViewRole = (r) => {
    if (r && r !== 'superuser') localStorage.setItem('viewRole', r)
    else localStorage.removeItem('viewRole')
    setViewRoleState(r && r !== 'superuser' ? r : null)
  }
  // Эффективный пользователь: суперпользователю с активным viewRole подменяем роль для UI.
  const user = realUser && isSuperuser && viewRole ? { ...realUser, role: viewRole } : realUser

  return (
    <AuthContext.Provider value={{
      user, assignableRoles, login, logout, activateSession, loading,
      realRole: realUser?.role, isSuperuser, viewRole, setViewRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
