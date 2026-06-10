// Ленивая загрузка Яндекс.Карт (JS API 2.1). Грузим скрипт один раз.
let loadPromise = null

export function loadYmaps(apiKey) {
  if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`
    s.async = true
    s.onload = () => window.ymaps.ready(() => resolve(window.ymaps))
    s.onerror = () => { loadPromise = null; reject(new Error('Не удалось загрузить Яндекс.Карты')) }
    document.head.appendChild(s)
  })
  return loadPromise
}

// Палитра для раскраски меток по водителям.
export const DRIVER_COLORS = [
  '#865fff', '#f48f1b', '#2ecc71', '#ff4655', '#3aa0ff',
  '#e056fd', '#ffd22e', '#1abc9c', '#e67e22', '#9b59b6',
  '#16a085', '#d35400', '#2980b9', '#c0392b', '#8e44ad',
]
