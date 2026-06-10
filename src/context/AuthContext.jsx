import { createContext, useContext, useState, useEffect } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [assignableRoles, setAssignableRoles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('token')
      if (!token) { setLoading(false); return }
      try {
        const { data } = await api.get('/auth/me')
        setUser(data.user)
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
    setUser(data.user)
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
    setUser(data.user)
    setAssignableRoles(data.assignable_roles || [])
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setAssignableRoles([])
  }

  return (
    <AuthContext.Provider value={{ user, assignableRoles, login, logout, activateSession, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
