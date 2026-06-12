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

  // Разовый запрос заявок по фильтру БЕЗ записи в общий список (для сверки/отчётов).
  queryOrders: async (params = {}) => {
    const { data } = await api.get('/orders', { params })
    return Array.isArray(data) ? data : []
  },

  // payload: { object_id, items:[{action,container_type_id,quantity,waste_class?,requested_container_ids?}], payment_method?, note?, desired_date?, desired_time? }
  addOrder: async (payload) => {
    const { data } = await api.post('/orders', payload)
    set((s) => ({ orders: [data, ...s.orders] }))
    return data
  },

  updateOrder: async (id, body) => {
    const { data } = await api.patch(`/orders/${id}`, body)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  sendToReview: async (body) => {
    const { data } = await api.post('/orders/send-to-review', body)
    return data
  },

  // «Отправить в Работу»: проверенные заявки дня/смены → in_progress (раздел «В работе»).
  sendToWork: async (body) => {
    const { data } = await api.post('/orders/send-to-work', body)
    return data
  },

  moveDriver: async (id, driver_id) => {
    const { data } = await api.post(`/orders/${id}/move-driver`, { driver_id })
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  // Задать порядок исполнения (приоритет внутри водителя). Локально проставляем seq.
  reorder: async (orderedIds) => {
    await api.post('/orders/reorder', { ordered_ids: orderedIds })
    set((s) => ({ orders: s.orders.map((o) => {
      const i = orderedIds.indexOf(o.id)
      return i >= 0 ? { ...o, seq: i } : o
    }) }))
  },

  // Мягкая отмена («в архив») — заявка остаётся в БД/журнале.
  cancelOrder: async (id) => {
    const { data } = await api.post(`/orders/${id}/cancel`)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  // Вернуть отменённую во «Входящие».
  restoreOrder: async (id) => {
    const { data } = await api.post(`/orders/${id}/restore`)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  removeOrder: async (id) => {
    await api.delete(`/orders/${id}`)
    set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }))
  },

  assign: async (id, body) => {
    const { data } = await api.post(`/orders/${id}/assign`, body)
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...data } : o)) }))
    return data
  },

  unassign: async (id) => {
    const { data } = await api.post(`/orders/${id}/unassign`)
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

  // Подтвердить заявку из «Ожидает подтверждения» → done + сообщение клиенту.
  confirm: async (id) => {
    const { data } = await api.post(`/orders/${id}/confirm`)
    return data
  },

  // Перенести невыполненный участок (под-задачу) в отдельную новую заявку.
  //  opts.assign = { driver_id, shift_date, shift_type, vehicle_id } → сразу назначить водителю;
  //  без assign → «Оставить в Заявках в работе» (новая заявка в пул).
  //  opts.desired_time — время заезда новой заявки (как в «Заявках в работе»).
  carryOverSubtask: async (subtaskId, opts = null) => {
    const body = {}
    if (opts?.assign) body.assign = opts.assign
    if (opts && 'desired_time' in opts) body.desired_time = opts.desired_time
    const { data } = await api.post(`/subtasks/${subtaskId}/carry-over`, body)
    return data
  },

  getByStatus: (status) => get().orders.filter((o) => o.status === status),

  getTodayOrders: () => {
    const today = new Date().toDateString()
    return get().orders.filter((o) => o.created_at && new Date(o.created_at).toDateString() === today)
  },
}))
