import { useState, useEffect, useRef } from 'react'
import { useRefsStore } from '@/store/refsStore'

// Автокомплит улицы. При выборе отдаёт {street_id, street_name, district_id, district, district_alias}.
export function StreetPicker({ value, onPick, placeholder = 'Начните вводить улицу…' }) {
  const searchStreets = useRefsStore((s) => s.searchStreets)
  const [q, setQ] = useState(value?.street_name || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => { setQ(value?.street_name || '') }, [value?.street_name])

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onType = (text) => {
    setQ(text)
    setOpen(true)
    clearTimeout(timer.current)
    if (text.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      const data = await searchStreets(text.trim())
      setResults(data)
      setActive(0)
    }, 220)
  }

  const pick = (s) => {
    onPick({
      street_id: s.id,
      street_name: s.name,
      district_id: s.district_id,
      district: s.district,
      district_alias: s.district_alias || null,
    })
    setQ(s.name)
    setOpen(false)
  }

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
              key={s.id}
              type="button"
              className={'a-autocomplete-item' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
            >
              <span>{s.name}</span>
              <span className="a-muted" style={{ fontSize: '0.78rem' }}>
                {s.district}{s.district_alias ? ` · ${s.district_alias}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
