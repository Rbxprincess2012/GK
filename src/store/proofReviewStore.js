import { create } from 'zustand'
import api from '@/lib/api'

// Очередь проверки пруфов: заявки с выполненными, но ещё не просмотренными участками.
export const useProofReviewStore = create((set) => ({
  queue: [],
  loading: false,

  fetchQueue: async (params = {}) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/proof-review', { params })
      set({ queue: Array.isArray(data) ? data : [], loading: false })
    } catch {
      set({ queue: [], loading: false })
    }
  },

  accept: async (subtaskId) => { await api.post(`/subtasks/${subtaskId}/accept`) },
  reject: async (subtaskId, comment) => { await api.post(`/subtasks/${subtaskId}/reject`, { comment }) },
}))
