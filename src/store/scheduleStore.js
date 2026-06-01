import { create } from 'zustand'
import { format, addDays } from 'date-fns'

// Генерируем тестовый график 3/3 для первых 5 водителей
function generateDaySchedule(driverIds) {
  const schedule = {}
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const date = format(addDays(today, i - 10), 'yyyy-MM-dd')
    schedule[date] = []
    driverIds.forEach((id, idx) => {
      // смещение цикла у каждого водителя разное
      const shift = Math.floor((i + idx * 2) / 3) % 2
      if (shift === 0) schedule[date].push(id)
    })
  }
  return schedule
}

const initialDayIds = [1, 2, 3, 4]
const initialDaySchedule = generateDaySchedule(initialDayIds)

export const useScheduleStore = create((set, get) => ({
  daySchedule: initialDaySchedule,   // { 'yyyy-MM-dd': [driverId, ...] }
  nightSchedule: {},                  // ручной

  // Добавить/убрать водителя из дня (дневная смена)
  toggleDayDriver: (date, driverId) => set((s) => {
    const current = s.daySchedule[date] || []
    const next = current.includes(driverId)
      ? current.filter((id) => id !== driverId)
      : [...current, driverId]
    return { daySchedule: { ...s.daySchedule, [date]: next } }
  }),

  // DnD: переместить водителя с одного дня на другой (дневная)
  moveDriver: (fromDate, toDate, driverId) => set((s) => {
    const from = (s.daySchedule[fromDate] || []).filter((id) => id !== driverId)
    const to = [...new Set([...(s.daySchedule[toDate] || []), driverId])]
    return {
      daySchedule: { ...s.daySchedule, [fromDate]: from, [toDate]: to },
    }
  }),

  // Ночная смена — ручное назначение
  toggleNightDriver: (date, driverId) => set((s) => {
    const current = s.nightSchedule[date] || []
    const next = current.includes(driverId)
      ? current.filter((id) => id !== driverId)
      : [...current, driverId]
    return { nightSchedule: { ...s.nightSchedule, [date]: next } }
  }),

  getWorkingToday: (shift = 'day') => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const s = get()
    return shift === 'day'
      ? s.daySchedule[today] || []
      : s.nightSchedule[today] || []
  },
}))
