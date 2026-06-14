import { fmtDesiredTime, TIME_SLOTS } from '@/lib/orderUi'

// Плашка желаемого времени заезда: конкретный час или «как можно быстрее» (пустое время).
// compact — только иконка ⚡ без подписи (для тесных мест в карточках).
export function DesiredTime({ time, compact = false }) {
  const s = fmtDesiredTime(time)
  // Мета-уровень единой шкалы карточки: 0.74 / 400 / приглушённый. Без пилюли.
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: '0.74rem', fontWeight: 400, color: '#92a2d4', whiteSpace: 'nowrap',
  }
  if (s) {
    return <span style={base} title="Желаемое время заезда">🕐 {s}</span>
  }
  return (
    <span style={base} title="Как можно быстрее">
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
