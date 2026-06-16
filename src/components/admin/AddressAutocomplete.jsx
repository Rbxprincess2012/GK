import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'

// Автокомплит адреса по DaData (любой город РФ). При выборе отдаёт
// { value, city, street, house, district, lat, lng } — заполняет объект свободным
// адресом + координатами, минуя справочник улиц Краснодара.
export function AddressAutocomplete({ value, onPick, placeholder = 'Адрес: город, улица, дом…' }) {
  // Стартовое значение берём из пропа; при выборе обновляем сами. Внешняя смена
  // объекта пересоздаёт компонент через key у места использования (без sync-эффекта).
  const [q, setQ] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onType = (text) => {
    setQ(text); setOpen(true)
    clearTimeout(timer.current)
    if (text.trim().length < 3) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/settings/dadata/address', { query: text.trim() })
        setResults(Array.isArray(data) ? data : []); setActive(0)
      } catch { setResults([]) }
    }, 250)
  }

  const pick = (s) => { onPick(s); setQ(s.value); setOpen(false) }

  const onKey = (e) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="a-input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKey}
      />
      {open && results.length > 0 && (
        <div className="a-autocomplete">
          {results.map((s, i) => (
            <button
              key={i}
              type="button"
              className={'a-autocomplete-item' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
            >
              <span>{s.value}</span>
              {(s.district || s.lat == null) && (
                <span className="a-muted" style={{ fontSize: '0.78rem' }}>
                  {s.district || ''}{s.lat == null ? `${s.district ? ' · ' : ''}без координат` : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
