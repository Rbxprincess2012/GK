// Слой хранилища раскладки сайдбара. ЕДИНСТВЕННОЕ место, где раскладка читается/
// пишется. Сейчас — localStorage (per-браузер). Для SaaS-мультитенанта здесь же
// меняем источник на API, привязанный к компании (per-tenant), не трогая UI.
const STORAGE_KEY = 'putevo.nav-layout.v1'

const clone = (layout) => JSON.parse(JSON.stringify(layout))

// Сливает сохранённую раскладку с дефолтной:
//  • выкидывает ключи, которых больше нет в каталоге (isValidKey);
//  • дописывает новые пункты каталога (которых не было при сохранении) в их
//    дефолтный контейнер — чтобы добавленная в код страница не потерялась.
export function loadLayout(defaultLayout, isValidKey) {
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { /* битый JSON — игнор */ }
  if (!stored || typeof stored !== 'object') return clone(defaultLayout)

  const out = {}
  for (const c of Object.keys(defaultLayout)) {
    const arr = Array.isArray(stored[c]) ? stored[c] : []
    out[c] = arr.filter(isValidKey)
  }
  // Дописываем недостающие дефолтные ключи в их исходный контейнер.
  const present = new Set(Object.values(out).flat())
  for (const c of Object.keys(defaultLayout)) {
    for (const k of defaultLayout[c]) {
      if (!present.has(k)) { out[c].push(k); present.add(k) }
    }
  }
  return out
}

export function saveLayout(layout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)) } catch { /* приватный режим/квота — игнор */ }
}

export function clearLayout() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* игнор */ }
}
