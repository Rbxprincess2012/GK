import { create } from 'zustand'
import api from '@/lib/api'

// Справочники: районы и улицы (read-only, seed из реестра Краснодара).
export const useRefsStore = create((set) => ({
  districts: [],
  streets: [],
  loading: false,

  fetchDistricts: async () => {
    const { data } = await api.get('/districts')
    set({ districts: data })
  },

  // поиск улицы по подстроке; возвращает [{id, name, district_id, district}]
  searchStreets: async (q) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/streets', { params: q ? { q } : {} })
      set({ streets: data, loading: false })
      return data
    } catch (e) {
      set({ loading: false })
      return []
    }
  },
}))
