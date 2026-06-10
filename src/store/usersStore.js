import { create } from 'zustand'
import api from '@/lib/api'

// Пользователи системы на реальном API (роли/доступ). Суперюзеры скрыты бэкендом от директора.
export const useUsersStore = create((set) => ({
  users: [],
  loading: false,

  fetchUsers: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/users')
      set({ users: data, loading: false })
    } catch { set({ loading: false }) }
  },

  addUser: async (payload) => {
    const { data } = await api.post('/users', payload) // { user, password }
    set((s) => ({ users: [...s.users, data.user] }))
    return data
  },

  updateUser: async (id, patch) => {
    const { data } = await api.patch(`/users/${id}`, patch)
    set((s) => ({ users: s.users.map((u) => (u.id === id ? data : u)) }))
    return data
  },

  toggleActive: async (id, is_active) => {
    const { data } = await api.patch(`/users/${id}`, { is_active })
    set((s) => ({ users: s.users.map((u) => (u.id === id ? data : u)) }))
    return data
  },

  resetPassword: async (id) => {
    const { data } = await api.post(`/users/${id}/reset-password`)
    return data.invite_url
  },

  removeUser: async (id) => {
    await api.delete(`/users/${id}`)
    set((s) => ({ users: s.users.filter((u) => u.id !== id) }))
  },
}))
