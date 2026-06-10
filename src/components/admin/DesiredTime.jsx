import { fmtDesiredTime, TIME_SLOTS } from '@/lib/orderUi'

// Плашка желаемого времени заезда: конкретный час или «как можно быстрее» (пустое время).
// compact — только иконка ⚡ без подписи (для тесных мест в карточках).
export function DesiredTime({ time, compact = false }) {
  const s = fmtDesiredTime(time)
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px',
    borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
  }
  if (s) {
    return <span style={{ ...base, background: 'rgba(96,165,250,.16)', color: '#93c5fd' }} title="Желаемое время заезда">🕐 {s}</span>
  }
  return (
    <span style={{ ...base, background: 'rgba(244,143,27,.16)', color: '#f8b36b' }} title="Как можно быстрее">
      ⚡{compact ? '' : ' Как можно быстрее'}
    </span>
  )
}

// Селект слота времени для форм: «⚡ Как можно быстрее» (value '') + 24 часовых слота.
export function TimeSlotSelect({ value, onChange, className = 'a-select' }) {
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">⚡ Как можно быстрее</option>
      {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}
