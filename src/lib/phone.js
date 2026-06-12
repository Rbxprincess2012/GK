// Телефон: +7-нормализация и формат как при наборе ('+7 912 123-65-65').
export function digitsOnly(s) { return (s || '').replace(/\D/g, '') }

// Национальная часть (10 цифр) из любого формата: убираем ведущую 7/8.
export function toNational(phone) {
  let d = digitsOnly(phone)
  if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1)
  return d.slice(0, 10)
}

export function toFull(national) { return national ? '+7' + national : '' }

export function formatNat(d) {
  if (!d) return ''
  let s = d.slice(0, 3)
  if (d.length > 3) s += ' ' + d.slice(3, 6)
  if (d.length > 6) s += '-' + d.slice(6, 8)
  if (d.length > 8) s += '-' + d.slice(8, 10)
  return s
}

// Сохранённый номер ('+79121236565') → формат как при наборе: '+7 912 123-65-65'.
export function formatPhone(full) {
  const nat = toNational(full)
  return nat ? '+7 ' + formatNat(nat) : (full || '')
}
