import { create } from 'zustand'
import api from '@/lib/api'

export const useDriversStore = create((set, get) => ({
  drivers: [],
  loading: false,
  error: null,

  fetchDrivers: async () => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/drivers')
      set({ drivers: data, loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  addDriver: async (driver) => {
    const { data } = await api.post('/drivers', driver)
    set((s) => ({ drivers: [...s.drivers, data] }))
    return data
  },

  updateDriver: async (id, patch) => {
    const { data } = await api.patch(`/drivers/${id}`, patch)
    set((s) => ({ drivers: s.drivers.map((d) => (d.id === id ? data : d)) }))
    return data
  },

  toggleActive: async (id) => {
    const d = get().drivers.find((x) => x.id === id)
    if (!d) return
    const { data } = await api.patch(`/drivers/${id}`, { is_active: !d.is_active })
    set((s) => ({ drivers: s.drivers.map((x) => (x.id === id ? data : x)) }))
  },

  removeDriver: async (id) => {
    await api.delete(`/drivers/${id}`)
    set((s) => ({ drivers: s.drivers.filter((d) => d.id !== id) }))
  },

  // Личная ссылка привязки бота: { code, url }. Менеджер отправляет водителю.
  botLink: async (id) => {
    const { data } = await api.post(`/drivers/${id}/bot-link`)
    return data
  },

  getActiveDrivers: () => get().drivers.filter((d) => d.is_active),
}))
