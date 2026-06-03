import { create } from 'zustand'
import api from '@/lib/api'

// Черновики заявок от ботов (Этап 2). Менеджер разбирает «Входящие»:
// promote → настоящая заявка (new), reject → отклонён. После любого из них
// черновик уходит из need_review-инбокса, поэтому убираем его из списка локально.
export const useDraftsStore = create((set) => ({
  drafts: [],
  loading: false,
  error: null,

  fetchDrafts: async (filter = {}) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/drafts', { params: filter })
      set({ drafts: Array.isArray(data) ? data : [], loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  // payload — как у создания заявки: { object_id, items:[…], desired_date?, desired_time?, note?, payment_method? }
  promote: async (id, payload) => {
    const { data } = await api.post(`/drafts/${id}/promote`, payload)
    set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }))
    return data
  },

  reject: async (id, reason) => {
    const { data } = await api.post(`/drafts/${id}/reject`, reason ? { reason } : {})
    set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }))
    return data
  },
}))
