import { useRef } from 'react'
import { fmtDate } from '@/lib/orderUi'

// Поле даты с гарантированным форматом дд.мм.гггг.
// Нативный <input type="date"> рисует дату в локали браузера (у части пользователей это mm/dd/yyyy),
// и форматом это не переопределить. Поэтому показываем своё текстовое поле (дд.мм.гггг),
// а календарь открываем у скрытого нативного input через showPicker(). Значение наружу — ISO yyyy-mm-dd.
export function DateField({ value, onChange, className = 'a-input', style }) {
  const ref = useRef(null)
  const open = () => {
    const el = ref.current
    if (!el) return
    if (el.showPicker) el.showPicker()
    else el.focus()
  }
  return (
    <div className="a-datefield" style={style}>
      <input
        className={className + ' a-datefield-text'}
        type="text"
        readOnly
        value={fmtDate(value)}
        placeholder="дд.мм.гггг"
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      />
      <input
        ref={ref}
        className="a-datefield-native"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
