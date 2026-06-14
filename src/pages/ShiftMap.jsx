import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { loadYmaps, DRIVER_COLORS } from '@/lib/yandexMaps'
import { DateField } from '@/components/admin/DateField'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shiftYmd(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)) }
function tomorrow() { return shiftYmd(ymd(new Date()), 1) }

const UNASSIGNED = '#7c8db5'
function addrLine(o) {
  return [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ') || o.district || '—'
}

export default function ShiftMap() {
  const toast = useToast()
  const { assign } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const [date, setDate] = useState(tomorrow())
  const [shiftType] = useState('day') // смена одна (день/ночь убраны)
  const [data, setData] = useState(null)
  const [apiKey, setApiKey] = useState(null)
  const [status, setStatus] = useState('loading') // loading | nokey | error | ready
  const [selected, setSelected] = useState(null) // ключ легенды: id водителя | 'none' | null=все
  const [picked, setPicked] = useState(null) // выбранная метка-заявка (для переназначения)
  const [farKm, setFarKm] = useState(15)      // порог «дальней» заявки
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const pickRef = useRef(null) // актуальный setPicked для обработчика клика по метке
  pickRef.current = setPicked

  // JS API-ключ из настроек.
  useEffect(() => {
    api.get('/settings/tokens')
      .then(({ data }) => setApiKey(data?.yandex_jsapi_key || ''))
      .catch(() => setApiKey(''))
  }, [])

  // Данные карты.
  const fetchData = useCallback(() => {
    api.get('/distribution/map', { params: { date, shift_type: shiftType } })
      .then(({ data }) => { setData(data); setSelected(null); setPicked(null) })
      .catch(() => toast.error('Не удалось загрузить заявки'))
  }, [date, shiftType, toast])
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchAvailable(date, shiftType) }, [fetchAvailable, date, shiftType])

  // Переназначить выбранную заявку водителю прямо с карты.
  const reassign = async (driverId) => {
    if (!picked) return
    try {
      await assign(picked.id, { driver_id: driverId, shift_date: date, shift_type: shiftType })
      toast.success(`#${picked.number} → ${available.find((d) => d.id === driverId)?.name || 'водитель'}`)
      setPicked(null)
      fetchData()
    } catch { toast.error('Не удалось переназначить') }
  }

  // Цвет по водителю (стабильный по отсортированным id).
  const driverColor = useMemo(() => {
    const ids = [...new Set((data?.orders || []).filter((o) => o.assigned_driver_id).map((o) => o.assigned_driver_id))].sort((a, b) => a - b)
    const m = new Map(ids.map((id, i) => [id, DRIVER_COLORS[i % DRIVER_COLORS.length]]))
    return (id) => (id ? m.get(id) || UNASSIGNED : UNASSIGNED)
  }, [data])

  // Легенда: водители (цвет, имя, число) + нераспределённые + без координат.
  const legend = useMemo(() => {
    if (!data) return []
    const by = {}
    for (const o of data.orders) {
      const key = o.assigned_driver_id || 'none'
      by[key] ||= { name: o.driver_name || 'Не распределены', color: driverColor(o.assigned_driver_id), count: 0, geo: 0 }
      by[key].count++
      if (o.lat != null) by[key].geo++
    }
    return Object.entries(by).map(([k, v]) => ({ id: k, ...v }))
  }, [data, driverColor])

  // Подходит ли заявка под выбранного водителя (null = все).
  const matches = useCallback((o) => {
    if (selected == null) return true
    if (selected === 'none') return !o.assigned_driver_id
    return String(o.assigned_driver_id) === String(selected)
  }, [selected])

  // Отрисовка карты: создаём один раз, дальше только перерисовываем метки.
  useEffect(() => {
    if (apiKey === null) return
    if (!apiKey) { setStatus('nokey'); return }
    if (!data) return
    let cancelled = false
    loadYmaps(apiKey).then((ymaps) => {
      if (cancelled || !mapRef.current) return
      if (!mapInstance.current) {
        const first = data.orders.find((o) => o.lat != null)
        const center = data.base ? [data.base.lat, data.base.lng]
          : (first ? [first.lat, first.lng] : [45.035, 38.975])
        mapInstance.current = new ymaps.Map(mapRef.current, { center, zoom: 11, controls: ['zoomControl', 'fullscreenControl'] })
      }
      const map = mapInstance.current
      map.geoObjects.removeAll()

      // База.
      if (data.base) {
        map.geoObjects.add(new ymaps.Placemark([data.base.lat, data.base.lng], {
          balloonContentHeader: 'База', balloonContentBody: data.base.address || '', iconContent: 'База',
        }, { preset: 'islands#redStretchyIcon', zIndex: 1000 }))
      }
      // Заявки (с учётом выбранного водителя). Дальние — крупнее и с км в подписи.
      for (const o of data.orders) {
        if (o.lat == null || o.lng == null || !matches(o)) continue
        const far = o.distance_km != null && o.distance_km >= farKm
        const pm = new ymaps.Placemark([o.lat, o.lng], {
          hintContent: `#${o.number} · ${addrLine(o)}${o.distance_km != null ? ` · ~${o.distance_km} км` : ''}`,
          iconCaption: far ? `#${o.number} · ${o.distance_km}км` : `#${o.number}`,
        }, {
          preset: far ? 'islands#circleIcon' : 'islands#circleDotIcon',
          iconColor: driverColor(o.assigned_driver_id),
          zIndex: far ? 500 : 100,
        })
        pm.events.add('click', () => pickRef.current(o))
        map.geoObjects.add(pm)
      }
      // Подгон под показанные точки.
      try {
        const bounds = map.geoObjects.getBounds()
        if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 })
      } catch { /* одна точка — оставляем zoom */ }
      setStatus('ready')
    }).catch(() => setStatus('error'))
    return () => { cancelled = true }
  }, [apiKey, data, driverColor, matches, farKm])

  // Уборка карты при размонтировании.
  useEffect(() => () => { if (mapInstance.current) { mapInstance.current.destroy(); mapInstance.current = null } }, [])

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Карта смены {data && <span className="a-count">{data.orders.length}</span>}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setDate(shiftYmd(date, -1))} title="День назад">‹</button>
          <DateField value={date} onChange={setDate} style={{ width: 150 }} />
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setDate(shiftYmd(date, 1))} title="День вперёд">›</button>
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setDate(tomorrow())}>Завтра</button>
          <span className="a-muted" style={{ fontSize: '0.8rem' }}>дальние ≥</span>
          <input className="a-input" type="number" min="0" step="1" value={farKm}
            onChange={(e) => setFarKm(Number(e.target.value) || 0)} style={{ width: 70 }} title="Порог «дальней» заявки, км" />
          <span className="a-muted" style={{ fontSize: '0.8rem' }}>км</span>
        </div>
      </div>

      {status === 'nokey' && (
        <div className="a-card"><div className="a-empty">
          Не задан ключ <b>JavaScript API</b>. Откройте «Настройки → Токены → Ключ JavaScript API».
        </div></div>
      )}
      {status === 'error' && (
        <div className="a-card"><div className="a-empty">Не удалось загрузить Яндекс.Карты (проверьте ключ и домен в Кабинете разработчика).</div></div>
      )}

      {status !== 'nokey' && status !== 'error' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 14, alignItems: 'start' }}>
          <div className="a-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div ref={mapRef} style={{ width: '100%', height: 'calc(100vh - 220px)', minHeight: 420 }} />
          </div>
          {picked && (
            <div className="a-card" style={{ marginBottom: 12, border: '1px solid rgba(244,143,27,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="a-section-title" style={{ margin: 0 }}>Заявка #{picked.number}</div>
                <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setPicked(null)}>✕</button>
              </div>
              <div style={{ fontSize: '0.84rem', marginBottom: 4 }}>{addrLine(picked)}</div>
              <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 2 }}>{picked.object_name || ''}{picked.client_legal_name ? ` · ${picked.client_legal_name}` : ''}</div>
              <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 10 }}>
                {picked.driver_name ? `Сейчас: ${picked.driver_name}` : 'Не распределена'}{picked.distance_km != null ? ` · ~${picked.distance_km} км` : ''}
              </div>
              <label className="a-field"><span>Переназначить водителю</span>
                <select className="a-select" value={picked.assigned_driver_id || ''}
                  onChange={(e) => e.target.value && reassign(Number(e.target.value))}>
                  <option value="">— выбрать —</option>
                  {available.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              {available.length === 0 && <div className="a-muted" style={{ fontSize: '0.74rem', marginTop: 6, color: '#e0a14b' }}>Никто не на смене на этот день.</div>}
            </div>
          )}

          <div className="a-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div className="a-section-title" style={{ margin: 0 }}>Водители</div>
              {selected != null && (
                <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}>Все</button>
              )}
            </div>
            <div className="a-muted" style={{ fontSize: '0.74rem', marginBottom: 6 }}>Клик — показать точки только этого водителя</div>
            {legend.length === 0 && <div className="a-empty">Нет заявок</div>}
            {legend.map((l) => {
              const active = selected != null && String(selected) === String(l.id)
              const dim = selected != null && !active
              return (
                <div key={l.id} onClick={() => setSelected(active ? null : l.id)}
                  title="Показать заявки этого водителя"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', margin: '0 -8px',
                    borderRadius: 8, cursor: 'pointer', opacity: dim ? 0.45 : 1,
                    background: active ? 'rgba(244,143,27,0.15)' : 'transparent',
                  }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: active ? 700 : 400 }}>{l.name}</span>
                  <span className="a-badge">{l.count}</span>
                </div>
              )
            })}
            {data?.no_geo_count > 0 && (
              <div className="a-muted" style={{ fontSize: '0.76rem', marginTop: 10, color: '#e0a14b' }}>
                ⚠ {data.no_geo_count} заявок без координат — не показаны. Геокодируйте объекты.
              </div>
            )}
            {!data?.base && (
              <div className="a-muted" style={{ fontSize: '0.76rem', marginTop: 8, color: '#e0a14b' }}>
                База не задана — задайте адрес в «Настройках».
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
