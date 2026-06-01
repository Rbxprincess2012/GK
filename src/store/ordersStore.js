import { create } from 'zustand'
import api from '@/lib/api'

// Заявки на реальном API (Этап 1). Бэкенд проставляет number/status/created_at.
export const useOrdersStore = create((set, get) => ({
  orders: [],
  loading: false,
  error: null,

  fetchOrders: async (filter = {}) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/orders', { params: filter })
      set({ orders: Array.isArray(data) ? data : [], loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  getOrder: async (id) => {
    const { data } = await api.get(`/orders/${id}`)
    return data
  },

  // payload: { object_id, items:[{action,container_type_id,quantity,waste_class?,requested_container_ids?}], payment_method?, note?, desired_date?, desired_time? }
  addOrder: async (payload) => {
    const { data } = await api.post('/orders', payload)
    set((s) => ({ orders: [data, ...s.orders] }))
    return data
  },

  assign: async (id, body) => {
    const { data } = await api.post(`/orders/${id}/assign`, body)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  accept: async (id) => {
    const { data } = await api.post(`/orders/${id}/accept`)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  fail: async (id, reason) => {
    const { data } = await api.post(`/orders/${id}/fail`, { reason })
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  complete: async (id, body) => {
    const { data } = await api.post(`/orders/${id}/complete`, body)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  close: async (id) => {
    const { data } = await api.post(`/orders/${id}/close`)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  getByStatus: (status) => get().orders.filter((o) => o.status === status),

  getTodayOrders: () => {
    const today = new Date().toDateString()
    return get().orders.filter((o) => o.created_at && new Date(o.created_at).toDateString() === today)
  },
}))
