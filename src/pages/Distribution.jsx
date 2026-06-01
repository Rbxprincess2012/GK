import { useState, useEffect, useCallback, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useToast } from '@/components/admin/Toast'
import { Draggable, Droppable } from '@/components/admin/dnd'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function orderTitle(o) {
  return o.object_name || [o.street_name, o.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ') || `Объект #${o.object_id}`
}
function clientName(o) { return o.client_nickname || o.client_legal_name || '—' }

function OrderCard({ o, overlay }) {
  return (
    <div className={'a-orderrow' + (overlay ? ' a-orderrow--overlay' : '')}>
      <span className="a-orderrow-num">#{o.number}</span>
      <span className="a-orderrow-client" title={clientName(o)}>{clientName(o)}</span>
      <span className="a-orderrow-obj a-muted" title={orderTitle(o)}>{orderTitle(o)}</span>
      <span className="a-orderrow-date a-muted">{o.desired_date ? o.desired_date.slice(0, 10) : '—'}</span>
    </div>
  )
}

export default function Distribution() {
  const { orders, fetchOrders, assign } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const toast = useToast()
  const [date, setDate] = useState(ymd(new Date()))
  const [shiftType, setShiftType] = useState('day')
  const [showAll, setShowAll] = useState(false)
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = useCallback(() => { fetchOrders({}); fetchAvailable(date, shiftType) }, [fetchOrders, fetchAvailable, date, shiftType])
  useEffect(() => { refresh() }, [refresh])

  // на дату распределения: заявки этой даты + без даты + просроченные (желаемая ≤ выбранной)
  const newOrders = useMemo(() => orders.filter((o) => {
    if (o.status !== 'new') return false
    if (showAll) return true
    const dd = o.desired_date?.slice(0, 10)
    return !dd || dd <= date
  }), [orders, showAll, date])

  const hiddenCount = useMemo(
    () => orders.filter((o) => o.status === 'new').length - orders.filter((o) => o.status === 'new' && (showAll || !o.desired_date?.slice(0, 10) || o.desired_date.slice(0, 10) <= date)).length,
    [orders, showAll, date])
  const byDistrict = useMemo(() => {
    const m = {}
    for (const o of newOrders) { const k = o.district_alias || o.district || 'Без района'; (m[k] ||= []).push(o) }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [newOrders])

  // загрузка в «слотах» (place/haul=1, replace=2 на контейнер)
  const loadByDriver = useMemo(() => {
    const m = {}
    for (const o of orders) {
      if ((o.status === 'assigned' || o.status === 'in_progress') && o.shift_date?.slice(0, 10) === date && o.shift_type === shiftType && o.assigned_driver_id)
        m[o.assigned_driver_id] = (m[o.assigned_driver_id] || 0) + (o.slots || 1)
    }
    return m
  }, [orders, date, shiftType])

  const activeOrder = useMemo(() => newOrders.find((o) => `order:${o.id}` === activeId), [newOrders, activeId])

  const onDragEnd = async ({ active, over }) => {
    setActiveId(null)
    const a = active.data.current
    const overId = over?.id
    if (!a || typeof overId !== 'string' || !overId.startsWith('driver:')) return
    const driverId = Number(overId.slice(7))
    const drv = available.find((d) => d.id === driverId)
    const cap = drv?.capacity_slots || 3
    const newLoad = (loadByDriver[driverId] || 0) + (a.order.slots || 1)
    try {
      await assign(a.order.id, { driver_id: driverId, shift_date: date, shift_type: shiftType, vehicle_id: drv?.vehicle_id ?? null })
      if (newLoad > cap) toast.info(`#${a.order.number} → ${drv?.name}: перевес ${newLoad}/${cap} — нужен доп. рейс`)
      else toast.success(`#${a.order.number} → ${drv?.name} (${newLoad}/${cap})`)
      refresh()
    } catch { toast.error('Ошибка назначения') }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={onDragEnd}
    >
      <div className="a-page">
        <div className="a-page-header">
          <h2>Распределение <span className="a-count">{newOrders.length}</span></h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select className="a-select" style={{ width: 130 }} value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
              <option value="day">Дневная</option><option value="night">Ночная</option>
            </select>
          </div>
        </div>

        <div className="a-chip-bar">
          <button className={'a-chip' + (!showAll ? ' active' : '')} onClick={() => setShowAll(false)}>На дату и просроченные</button>
          <button className={'a-chip' + (showAll ? ' active' : '')} onClick={() => setShowAll(true)}>Все новые</button>
          {!showAll && hiddenCount > 0 && (
            <span className="a-muted" style={{ fontSize: '0.78rem' }}>скрыто будущих: {hiddenCount}</span>
          )}
          <span className="a-muted" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>Перетащите заявку на водителя, чтобы назначить</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
          {/* заявки по районам */}
          <div>
            {byDistrict.length === 0 && <div className="a-card"><div className="a-empty">Новых заявок нет 🎉</div></div>}
            {byDistrict.map(([district, list]) => (
              <div key={district} className="a-card" style={{ marginBottom: 14 }}>
                <div className="a-section-title" style={{ marginTop: 0 }}>{district} <span className="a-count">{list.length}</span></div>
                <div className="a-orderrow a-orderrow--head">
                  <span className="a-orderrow-num">№</span>
                  <span className="a-orderrow-client">Клиент</span>
                  <span className="a-orderrow-obj">Объект</span>
                  <span className="a-orderrow-date">Желаемая</span>
                </div>
                {list.map((o) => (
                  <Draggable key={o.id} id={`order:${o.id}`} data={{ kind: 'order', order: o }} className="a-drag">
                    <OrderCard o={o} />
                  </Draggable>
                ))}
              </div>
            ))}
          </div>

          {/* водители-дроп-зоны */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="a-pool-hint">На смене · {date}</div>
            {available.length === 0 && <div className="a-empty">Никто не на смене. Откройте «График» и поставьте статус «Смена».</div>}
            {available.map((d) => {
              const load = loadByDriver[d.id] || 0
              const cap = d.capacity_slots || 3
              const color = load === 0 ? '#92a2d4' : load <= cap ? '#2ecc71' : '#f48f1b'
              return (
                <Droppable key={d.id} id={`driver:${d.id}`} className="a-driverzone">
                  <span className="a-dot" style={{ background: color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div className="a-muted" style={{ fontSize: '0.78rem' }}>{d.vehicle_id ? `машина #${d.vehicle_id}` : 'без машины'} · вместим. {cap}</div>
                  </div>
                  <span className="a-badge" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>{load}/{cap}</span>
                </Droppable>
              )
            })}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeOrder && <OrderCard o={activeOrder} overlay />}
      </DragOverlay>
    </DndContext>
  )
}
