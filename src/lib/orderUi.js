// Общие ярлыки/хелперы для заявок — единый источник для всех экранов.
export const STATUS = {
  new: ['Новая', 'orange'],
  assigned: ['Назначена', 'purple'],
  in_progress: ['В работе', 'purple'],
  done: ['Выполнена', 'green'],
  closed: ['Закрыта', 'purple'],
  cancelled: ['Отменена', 'red'],
}
export const ACTION = { place: 'Установить', replace: 'Заменить', haul: 'Вывезти' }

export function clientName(o) { return o?.client_nickname || o?.client_legal_name || '—' }
export function orderTitle(o) {
  return o?.object_name || [o?.street_name, o?.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ') || `Объект #${o?.object_id}`
}
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
