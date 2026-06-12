import { create } from 'zustand'
import api from '@/lib/api'

// Заказчики и их объекты — на реальном API (Этап 1).
export const useClientsStore = create((set, get) => ({
  clients: [],
  groups: [],            // группы компаний (ГК)
  objectsByClient: {}, // { [clientId]: [objects] }
  loading: false,
  error: null,

  // ── Группы компаний (ГК) ──────────────────────────────────────────────────
  fetchGroups: async () => {
    const { data } = await api.get('/company-groups')
    set({ groups: data })
    return data
  },
  addGroup: async (group) => {
    const { data } = await api.post('/company-groups', group)
    set((s) => ({ groups: [...s.groups, data] }))
    return data
  },
  updateGroup: async (id, patch) => {
    const { data } = await api.patch(`/company-groups/${id}`, patch)
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? data : g)) }))
    return data
  },
  removeGroup: async (id) => {
    await api.delete(`/company-groups/${id}`)
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }))
  },

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

  // ── Доверенные лица ───────────────────────────────────────────────────────
  trustedByClient: {}, // { [clientId]: [persons] } — пул, доступный клиенту
  trustedByGroup: {},  // { [groupId]: [persons] } — все лица группы (для управления)

  // Пул лиц, доступных клиенту (если он в ГК — лица всей группы).
  fetchTrusted: async (clientId) => {
    const { data } = await api.get('/trusted-persons', { params: { for_client: clientId } })
    set((s) => ({ trustedByClient: { ...s.trustedByClient, [clientId]: data } }))
    return data
  },
  // Все лица конкретной ГК (для центрального списка).
  fetchGroupTrusted: async (groupId) => {
    const { data } = await api.get('/trusted-persons', { params: { group_id: groupId } })
    set((s) => ({ trustedByGroup: { ...s.trustedByGroup, [groupId]: data } }))
    return data
  },

  // Создаёт лицо. Кэш не трогаем — вызывающий перечитывает нужный список.
  addTrusted: async (person) => {
    const { data } = await api.post('/trusted-persons', person)
    return data
  },
  updateTrusted: async (id, patch) => {
    const { data } = await api.patch(`/trusted-persons/${id}`, patch)
    return data
  },
  removeTrusted: async (id) => { await api.delete(`/trusted-persons/${id}`) },
  // Онбординг лица в Telegram: выдать ссылку-приглашение / отвязать канал.
  invitePerson: async (id) => (await api.post(`/trusted-persons/${id}/invite`)).data,
  revokePerson: async (id) => (await api.post(`/trusted-persons/${id}/revoke`)).data,

  // ── Участки объекта ───────────────────────────────────────────────────────
  addSection: async (object_id, name, note) => {
    const { data } = await api.post('/sections', { object_id, name, note: note || null })
    return data
  },
  removeSection: async (id) => { await api.delete(`/sections/${id}`) },

  getClientById: (id) => get().clients.find((c) => c.id === id),
}))
