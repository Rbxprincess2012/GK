import { useState, useEffect, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useDriversStore } from '@/store/driversStore'
import { useVehiclesStore } from '@/store/vehiclesStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { OrderModal } from '@/components/admin/OrderModal'
import { Draggable, Droppable } from '@/components/admin/dnd'
import { useToast } from '@/components/admin/Toast'
import { STATUS, clientName, orderTitle } from '@/lib/orderUi'

const SHIFT_STATUS = { present: ['Смена', '#2ecc71'], sick: ['Болеет', '#ff4655'], vacation: ['Отпуск', '#f48f1b'] }

function OrderLineBody({ o, onOpen }) {
  return (
    <div className="a-dayorder">
      <span className="a-orderrow-num" style={{ minWidth: 40 }}>#{o.number}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName(o)}</div>
        <div className="a-muted" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orderTitle(o)}</div>
      </div>
      <span className="a-muted" style={{ fontSize: '0.74rem' }} title="слотов">{o.slots || 1}сл</span>
      <span className={`a-badge a-badge--${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0]}</span>
      {onOpen && <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); onOpen(o) }}>Открыть</button>}
    </div>
  )
}

// «План дня»: водители смены + заявки этого дня. Перетаскивание заявки на водителя = переназначение.
export function DayModal({ date, shiftType, onClose, onReload }) {
  const { orders, fetchOrders, getOrder, assign } = useOrdersStore()
  const { shifts } = useShiftsStore()
  const { drivers } = useDriversStore()
  const { vehicles, fetchVehicles } = useVehiclesStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  const [openOrder, setOpenOrder] = useState(null)
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => { fetchOrders({}); fetchTypes(); fetchVehicles() }, [fetchOrders, fetchTypes, fetchVehicles])

  const driverName = (id) => drivers.find((d) => d.id === id)?.name || `#${id}`
  const capOf = (s) => {
    const vid = s.vehicle_id ?? drivers.find((d) => d.id === s.driver_id)?.default_vehicle_id
    return vehicles.find((v) => v.id === vid)?.capacity_slots ?? 3
  }
  const loadOf = (driverId) => (ordersByDriver[driverId] || []).reduce((n, o) => n + (o.slots || 1), 0)

  const dayDrivers = useMemo(() => shifts
    .filter((s) => s.date?.slice(0, 10) === date && s.shift_type === shiftType)
    .sort((a, b) => driverName(a.driver_id).localeCompare(driverName(b.driver_id), 'ru')),
    [shifts, date, shiftType, drivers])

  const dayOrders = useMemo(() => orders.filter(
    (o) => o.shift_date?.slice(0, 10) === date && o.shift_type === shiftType),
    [orders, date, shiftType])

  const ordersByDriver = useMemo(() => {
    const m = {}
    for (const o of dayOrders) (m[o.assigned_driver_id] ||= []).push(o)
    return m
  }, [dayOrders])

  const openFull = async (o) => { setOpenOrder(await getOrder(o.id)) }
  const afterChange = () => { fetchOrders({}); onReload?.(); setOpenOrder(null) }

  const activeOrder = useMemo(() => dayOrders.find((o) => `dord:${o.id}` === activeId), [dayOrders, activeId])

  const reassign = async (order, driverId) => {
    if (order.assigned_driver_id === driverId) return
    const tgt = dayDrivers.find((s) => s.driver_id === driverId)
    const cap = tgt ? capOf(tgt) : 3
    const newLoad = loadOf(driverId) + (order.slots || 1)
    try {
      await assign(order.id, { driver_id: driverId, shift_date: date, shift_type: shiftType, vehicle_id: tgt?.vehicle_id ?? null })
      if (newLoad > cap) toast.info(`#${order.number} → ${driverName(driverId)}: перевес ${newLoad}/${cap} — нужен доп. рейс`)
      else toast.success(`#${order.number} → ${driverName(driverId)} (${newLoad}/${cap})`)
      fetchOrders({}); onReload?.()
    } catch { toast.error('Не удалось переназначить') }
  }

  const onDragEnd = ({ active, over }) => {
    setActiveId(null)
    const order = active.data.current?.order
    const overId = over?.id
    if (!order || typeof overId !== 'string' || !overId.startsWith('drv:')) return
    reassign(order, Number(overId.slice(4)))
  }

  const orphan = ordersByDriver['null'] || ordersByDriver[null]

  return (
    <>
      <Modal
        title={`План на ${date} · ${shiftType === 'night' ? 'ночь' : 'день'}`}
        onClose={onClose}
        width={560}
        footer={<button className="a-btn a-btn--ghost" onClick={onClose}>Закрыть</button>}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={onDragEnd}
        >
          {dayDrivers.length === 0 && dayOrders.length === 0 && (
            <div className="a-empty">На этот день никого нет в смене и нет заявок. Поставьте водителей в график и распределите заявки.</div>
          )}

          {dayDrivers.length > 0 && (
            <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 10 }}>Перетащите заявку на другого водителя, чтобы переназначить.</div>
          )}

          {dayDrivers.map((s) => {
            const list = ordersByDriver[s.driver_id] || []
            const [stLabel, stColor] = SHIFT_STATUS[s.status] || SHIFT_STATUS.present
            const cap = capOf(s)
            const load = loadOf(s.driver_id)
            const loadColor = load === 0 ? '#92a2d4' : load <= cap ? '#2ecc71' : '#f48f1b'
            return (
              <Droppable key={s.driver_id} id={`drv:${s.driver_id}`} className="a-card a-driverbox">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span className="a-dot" style={{ background: stColor }} />
                  <b style={{ flex: 1 }}>{driverName(s.driver_id)}</b>
                  <span className="a-muted" style={{ fontSize: '0.78rem' }}>{stLabel}{s.vehicle_id ? ` · машина #${s.vehicle_id}` : ''}</span>
                  <span className="a-badge" style={{ background: `${loadColor}22`, color: loadColor, borderColor: `${loadColor}55` }} title="занято/вместимость слотов">{load}/{cap}</span>
                </div>
                {list.length === 0
                  ? <div className="a-muted" style={{ fontSize: '0.8rem', paddingTop: 6 }}>перетащите сюда заявку</div>
                  : list.map((o) => (
                      <Draggable key={o.id} id={`dord:${o.id}`} data={{ order: o }} className="a-drag">
                        <OrderLineBody o={o} onOpen={openFull} />
                      </Draggable>
                    ))}
              </Droppable>
            )
          })}

          {orphan?.length > 0 && (
            <div className="a-card" style={{ marginBottom: 12, padding: 12, borderColor: 'rgba(255,70,85,0.3)' }}>
              <div className="a-section-title" style={{ marginTop: 0 }}>Без водителя</div>
              {orphan.map((o) => (
                <Draggable key={o.id} id={`dord:${o.id}`} data={{ order: o }} className="a-drag">
                  <OrderLineBody o={o} onOpen={openFull} />
                </Draggable>
              ))}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeOrder && <div className="a-dayorder a-dayorder--overlay"><OrderLineBody o={activeOrder} /></div>}
          </DragOverlay>
        </DndContext>
      </Modal>

      {openOrder && (
        <OrderModal order={openOrder} types={types} onClose={() => setOpenOrder(null)} onChanged={afterChange} />
      )}
    </>
  )
}
