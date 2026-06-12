// Иконка Telegram (бумажный самолётик — официальный логотип, а не эмодзи-авиалайнер).
export function TelegramIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}

// Логотип мессенджера MAX: squircle с фирменным сине-голубым градиентом и белой «M».
// Единственный источник логотипа в проекте — используйте этот компонент везде.
export function MaxIcon({ size = 14 }) {
  const gid = 'max-g' // один градиент на документ — id может повторяться, браузер берёт первый
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2ccbff" /><stop offset="1" stopColor="#2b7bff" />
        </linearGradient>
      </defs>
      {/* squircle вместо прямого rx — ближе к фирменной форме */}
      <path fill={`url(#${gid})`} d="M12 1.2c5.4 0 7.2.3 8.7 1.8C22.5 4.8 22.8 6.6 22.8 12s-.3 7.2-2.1 8.9c-1.5 1.6-3.3 1.9-8.7 1.9s-7.2-.3-8.7-1.9C1.5 19.2 1.2 17.4 1.2 12s.3-7.2 2.1-9C4.8 1.5 6.6 1.2 12 1.2z" />
      <path fill="#fff" d="M6.3 17.4V6.6h2.5l3.2 4.9 3.2-4.9h2.5v10.8h-2.6v-6.5l-3.1 4.6-3.1-4.6v6.5z" />
    </svg>
  )
}

// Бейдж одного мессенджера: Telegram (логотип) или MAX (аватарка-иконка).
function OneTag({ value, label }) {
  if (value === 'telegram') return <span className="a-mtag a-mtag--tg"><TelegramIcon />{label && <span>Telegram</span>}</span>
  if (value === 'max') return <span className="a-mtag a-mtag--max"><MaxIcon />{label && <span>MAX</span>}</span>
  return null
}

// Бейдж мессенджера(ов): value — строка ('telegram'|'max') ИЛИ массив (['telegram','max']).
export function MessengerTag({ value, label = false }) {
  const list = Array.isArray(value) ? value : (value ? [value] : [])
  if (!list.length) return null
  return <>{list.map((v) => <OneTag key={v} value={v} label={label} />)}</>
}

// Поля адресов чатов под выбранные мессенджеры: менеджер вставляет, куда слать точечно.
// Показываются только для отмеченных мессенджеров. chats — { telegram?, max? }.
export function MessengerChatInputs({ messengers = [], chats = {}, onChange }) {
  const set = (key, v) => onChange({ ...chats, [key]: v })
  const rows = [
    messengers.includes('telegram') && ['telegram', <TelegramIcon key="i" />, 'Telegram', '@username, ссылка t.me/… или chat id'],
    messengers.includes('max') && ['max', <MaxIcon key="i" />, 'MAX', 'ссылка max.ru/u/… или id чата'],
  ].filter(Boolean)
  if (!rows.length) return null
  return (
    <div className="a-chataddr">
      {rows.map(([key, icon, label, ph]) => (
        <label key={key} className="a-chataddr-row">
          <span className="a-chataddr-label">{icon}<span>{label}</span></span>
          <input className="a-input" value={chats[key] || ''} placeholder={ph}
            onChange={(e) => set(key, e.target.value)} />
        </label>
      ))}
    </div>
  )
}

// Поле телефона с автоматическим префиксом +7 и выбором мессенджера (Telegram / MAX).
// Значение наружу — полный номер вида "+79991234567" и messenger: 'telegram'|'max'|null.
// Используется в формах водителя и доверенного лица.

function digitsOnly(s) { return (s || '').replace(/\D/g, '') }
// Национальная часть (10 цифр) из любого формата: убираем ведущую 7/8.
function toNational(phone) {
  let d = digitsOnly(phone)
  if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1)
  return d.slice(0, 10)
}
function toFull(national) { return national ? '+7' + national : '' }
function formatNat(d) {
  if (!d) return ''
  let s = d.slice(0, 3)
  if (d.length > 3) s += ' ' + d.slice(3, 6)
  if (d.length > 6) s += '-' + d.slice(6, 8)
  if (d.length > 8) s += '-' + d.slice(8, 10)
  return s
}

// multi=false → одиночный выбор, наружу { phone, messenger }.
// multi=true  → можно отметить оба, наружу { phone, messengers: [...] }.
export function PhoneMessengerField({ phone, messenger, messengers, multi = false, onChange, label = 'Телефон' }) {
  const national = toNational(phone)
  const sel = multi ? (messengers || []) : (messenger ? [messenger] : [])
  const isOn = (m) => sel.includes(m)

  const emit = (fullPhone, nextSel) => {
    if (multi) onChange({ phone: fullPhone, messengers: nextSel })
    else onChange({ phone: fullPhone, messenger: nextSel[0] ?? null })
  }
  const setPhone = (raw) => emit(toFull(toNational(raw)), sel)
  const toggle = (m) => {
    const next = multi
      ? (isOn(m) ? sel.filter((x) => x !== m) : [...sel, m])
      : (isOn(m) ? [] : [m])
    emit(phone ?? '', next)
  }

  return (
    <div className="a-field">
      <span>{label}</span>
      <input className="a-input" inputMode="tel" placeholder="+7 9XX XXX-XX-XX"
        value={'+7' + (national ? ' ' + formatNat(national) : ' ')}
        onChange={(e) => setPhone(e.target.value)} />
      <div className="a-msgr">
        <span className="a-muted" style={{ fontSize: '0.76rem' }}>{multi ? 'Мессенджеры:' : 'Мессенджер:'}</span>
        <button type="button" className={'a-msgr-btn a-msgr-btn--tgwrap' + (isOn('telegram') ? ' is-on a-msgr-btn--tg' : '')}
          onClick={() => toggle('telegram')} title="Отправлять сообщения в Telegram"><TelegramIcon /> Telegram</button>
        <button type="button" className={'a-msgr-btn a-msgr-btn--maxwrap' + (isOn('max') ? ' is-on a-msgr-btn--max' : '')}
          onClick={() => toggle('max')} title="Отправлять сообщения в MAX"><MaxIcon /> MAX</button>
      </div>
    </div>
  )
}
