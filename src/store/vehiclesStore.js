import { create } from 'zustand'
import api from '@/lib/api'

export const useVehiclesStore = create((set) => ({
  vehicles: [],
  loading: false,
  error: null,

  fetchVehicles: async () => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/vehicles')
      set({ vehicles: data, loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  addVehicle: async (v) => {
    const { data } = await api.post('/vehicles', v)
    set((s) => ({ vehicles: [...s.vehicles, data] }))
    return data
  },

  updateVehicle: async (id, patch) => {
    const { data } = await api.patch(`/vehicles/${id}`, patch)
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? data : v)) }))
    return data
  },

  removeVehicle: async (id) => {
    await api.delete(`/vehicles/${id}`)
    set((s) => ({ vehicles: s.vehicles.filter((v) => v.id !== id) }))
  },
}))
