import { create } from 'zustand'
import api from '@/lib/api'

// График смен (план/факт) + доступные на смену водители.
export const useShiftsStore = create((set) => ({
  shifts: [],
  available: [],
  loading: false,

  fetchRange: async (from, to) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/shifts', { params: { from, to } })
      set({ shifts: data, loading: false })
      return data
    } catch (e) {
      set({ loading: false })
      return []
    }
  },

  upsertShift: async (payload) => {
    const { data } = await api.put('/shifts', payload)
    set((s) => {
      const rest = s.shifts.filter((x) =>
        !(x.driver_id === data.driver_id && x.date === data.date && x.shift_type === data.shift_type))
      return { shifts: [...rest, data] }
    })
    return data
  },

  removeShift: async (driver_id, date, shift_type) => {
    await api.delete('/shifts', { params: { driver_id, date, shift_type } })
    set((s) => ({
      shifts: s.shifts.filter((x) =>
        !(x.driver_id === driver_id && x.date?.slice(0, 10) === date && x.shift_type === shift_type)),
    }))
  },

  fetchAvailable: async (date, shift_type) => {
    const { data } = await api.get('/shifts/available', { params: { date, shift_type } })
    set({ available: data })
    return data
  },
}))
