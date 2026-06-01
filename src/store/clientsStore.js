import { create } from 'zustand'
import api from '@/lib/api'

// Заказчики и их объекты — на реальном API (Этап 1).
export const useClientsStore = create((set, get) => ({
  clients: [],
  objectsByClient: {}, // { [clientId]: [objects] }
  loading: false,
  error: null,

  fetchClients: async () => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/clients')
      set({ clients: data, loading: false })
    } catch (e) {
      set({ error: e?.message || 'Ошибка загрузки', loading: false })
    }
  },

  addClient: async (client) => {
    const { data } = await api.post('/clients', client)
    set((s) => ({ clients: [...s.clients, data] }))
    return data
  },

  updateClient: async (id, patch) => {
    const { data } = await api.patch(`/clients/${id}`, patch)
    set((s) => ({ clients: s.clients.map((c) => (c.id === id ? data : c)) }))
    return data
  },

  removeClient: async (id) => {
    await api.delete(`/clients/${id}`)
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }))
  },

  fetchObjects: async (clientId) => {
    const { data } = await api.get(`/clients/${clientId}/objects`)
    set((s) => ({ objectsByClient: { ...s.objectsByClient, [clientId]: data } }))
    return data
  },

  addObject: async (object) => {
    const { data } = await api.post('/objects', object)
    set((s) => {
      const list = s.objectsByClient[object.client_id] || []
      return { objectsByClient: { ...s.objectsByClient, [object.client_id]: [...list, data] } }
    })
    return data
  },

  updateObject: async (id, patch) => {
    const { data } = await api.patch(`/objects/${id}`, patch)
    set((s) => {
      const cid = data.client_id
      const list = (s.objectsByClient[cid] || []).map((o) => (o.id === id ? data : o))
      return { objectsByClient: { ...s.objectsByClient, [cid]: list } }
    })
    return data
  },

  removeObject: async (id, clientId) => {
    await api.delete(`/objects/${id}`)
    set((s) => {
      const list = (s.objectsByClient[clientId] || []).filter((o) => o.id !== id)
      return { objectsByClient: { ...s.objectsByClient, [clientId]: list } }
    })
  },

  fetchInventory: async (objectId) => {
    const { data } = await api.get(`/objects/${objectId}/inventory`)
    return data
  },

  getClientById: (id) => get().clients.find((c) => c.id === id),
}))
