import { create } from 'zustand'
import api from '@/lib/api'

export const useContainersStore = create((set) => ({
  containers: [],
  types: [],
  loading: false,
  error: null,

  fetchContainers: async (filter = {}) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/containers', { params: filter })
      set({ containers: data, loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  fetchTypes: async () => {
    const { data } = await api.get('/container-types')
    set({ types: data })
    return data
  },

  addType: async (t) => {
    const { data } = await api.post('/container-types', t)
    set((s) => ({ types: [...s.types, data] }))
    return data
  },
  updateType: async (id, patch) => {
    const { data } = await api.patch(`/container-types/${id}`, patch)
    set((s) => ({ types: s.types.map((t) => (t.id === id ? data : t)) }))
    return data
  },
  removeType: async (id) => {
    await api.delete(`/container-types/${id}`)
    set((s) => ({ types: s.types.filter((t) => t.id !== id) }))
  },
  // Отметить тип «стандартным» (по умолчанию) — единственный на справочник.
  setDefaultType: async (id) => {
    const { data } = await api.post(`/container-types/${id}/default`)
    set({ types: data })
    return data
  },

  addContainer: async (c) => {
    const { data } = await api.post('/containers', c)
    set((s) => ({ containers: [...s.containers, data] }))
    return data
  },

  updateContainer: async (id, patch) => {
    const { data } = await api.patch(`/containers/${id}`, patch)
    set((s) => ({ containers: s.containers.map((c) => (c.id === id ? data : c)) }))
    return data
  },

  removeContainer: async (id) => {
    await api.delete(`/containers/${id}`)
    set((s) => ({ containers: s.containers.filter((c) => c.id !== id) }))
  },
}))
