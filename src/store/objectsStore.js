import { create } from 'zustand'
import api from '@/lib/api'

// Плоский справочник всех объектов (для страницы «Объекты»).
export const useObjectsStore = create((set) => ({
  objects: [],
  loading: false,

  fetchAll: async (filters = {}) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/objects', { params: filters })
      set({ objects: data, loading: false })
      return data
    } catch {
      set({ loading: false })
      return []
    }
  },
}))
