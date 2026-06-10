import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useContainersStore } from '@/store/containersStore'
import { useToast } from '@/components/admin/Toast'
import { Draggable, Droppable, snapCenterToCursor } from '@/components/admin/dnd'
import { OrderModal } from '@/components/admin/OrderModal'
import { DriverLoad } from '@/components/admin/DriverLoad'
import { ContainerJob } from '@/components/admin/ContainerJob'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { isCash, fmtMoney, autoRouteOrder } from '@/lib/orderUi'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shiftYmd(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)) }
function tomorrow() { return shiftYmd(ymd(new Date()), 1) }
function clientLegal(o) { return o.client_legal_name || o.client_nickname || '—' }
function objectName(o) { return o.object_name || `Объект #${o.object_id}` }
function addressLine(o) {
  return [o.street_name, o.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ')
    || o.district_alias || o.district || '—'
}

// «На проверке» = распределённые, но ещё НЕ отправленные водителям заявки.
// После «Отправить в Работу» они уходят в раздел «В работе» (in_progress).
const REVIEW_STATUSES = ['assigned', 'review']

// Коллизии: если курсор над карточкой (slot:) — предпочитаем её колонке (driver:),
// чтобы перетаскивание ВНУТРИ водителя задавало позицию вставки.
function preferSlots(args) {
  const hits = pointerWithin(args)
  const slot = hits.find((h) => String(h.id).startsWith('slot:'))
  return slot ? [slot] : hits
}

// Карточка: Улица / Объект / Заказчик — для водителя главное улица, она сверху.
// Если строка шире колонки — колонка скроллится по горизонтали (см. .a-reviewcol-body).
function ReviewCard({ o, overlay, seqNo, onOpen }) {
  return (
    <div className={'a-reviewcard' + (overlay ? ' a-reviewcard--overlay' : '')}>
      <div className="a-reviewcard-top">
        {seqNo != null && <span className="a-reviewcard-seq" title="Приоритет (порядок исполнения)">{seqNo}</span>}
        <span className="a-reviewcard-num">#{o.number}</span>
        {isCash(o) && <span className="a-cash" title="Оплата наличными">💵 {o.amount != null ? fmtMoney(o.amount) : 'НАЛ'}</span>}
        {!overlay && (
          <button className="a-orderrow-open" title="Открыть заявку" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOpen?.(o) }}>✎</button>
        )}
      </div>
      <div className="a-reviewcard-line a-reviewcard-street">{addressLine(o)}</div>
      <div style={{ margin: '2px 0 4px' }}><DesiredTime time={o.desired_time} compact /></div>
      <div className="a-reviewcard-line">{objectName(o)}</div>
      <ContainerJob o={o} />
      <div className="a-reviewcard-line a-muted">{clientLegal(o)}</div>
    </div>
  )
}

export default function Review() {
  const { orders, fetchOrders, moveDriver, reorder, getOrder, sendToWork } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [date, setDate] = useState(tomorrow())
  const [shiftType] = useState('day') // смена одна (день/ночь убраны)
  const [activeId, setActiveId] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = useCallback(() => { fetchOrders({}); fetchAvailable(date, shiftType) }, [fetchOrders, fetchAvailable, date, shiftType])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchTypes() }, [fetchTypes])

  // Заявки на проверке за выбранный день/смену.
  const reviewOrders = useMemo(
    () => orders.filter((o) => REVIEW_STATUSES.includes(o.status) && o.shift_date?.slice(0, 10) === date && o.shift_type === shiftType),
    [orders, date, shiftType])

  const ordersByDriver = useMemo(() => {
    const m = {}
    for (const o of reviewOrders) if (o.assigned_driver_id) (m[o.assigned_driver_id] ||= []).push(o)
    // Порядок исполнения: по seq (приоритет), затем по номеру для ещё не упорядоченных.
    for (const k in m) m[k].sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.number - b.number)
    return m
  }, [reviewOrders])

  // Колонки: водители на смене + те, на ком уже висят заявки на проверке.
  const driverCols = useMemo(() => {
    const map = new Map()
    for (const d of available) map.set(d.id, { id: d.id, name: d.name, vehicle_id: d.vehicle_id })
    for (const [drvId, list] of Object.entries(ordersByDriver)) {
      const idNum = Number(drvId)
      if (!map.has(idNum)) map.set(idNum, { id: idNum, name: list[0]?.driver_name || `Водитель #${idNum}`, vehicle_id: list[0]?.vehicle_id })
    }
    return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [available, ordersByDriver])

  const activeOrder = useMemo(() => reviewOrders.find((o) => `order:${o.id}` === activeId), [reviewOrders, activeId])

  const openDetail = async (o) => {
    try { const full = await getOrder(o.id); setDetailOrder({ ...o, ...full }) }
    catch { toast.error('Не удалось открыть заявку') }
  }

  // Авто-порядок маршрута: для каждого водителя проставляем seq по эвристике
  // (районы кучно, доставки раньше заборов). Один reorder на весь день.
  const doAutoRoute = async () => {
    const orderedIds = driverCols.flatMap((d) => autoRouteOrder(ordersByDriver[d.id] || []).map((o) => o.id))
    if (!orderedIds.length) return
    try {
      await reorder(orderedIds)
      toast.success('Порядок маршрута выставлен по районам')
      refresh()
    } catch { toast.error('Не удалось упорядочить') }
  }

  const doSendToWork = async () => {
    if (reviewOrders.length === 0) return
    if (!(await toast.confirm(`Отправить в работу ${reviewOrders.length} заявк(и) на ${date}? Водители получат задания, клиенты — уведомления. Заявки переедут в раздел «В работе».`))) return
    try {
      const r = await sendToWork({ shift_date: date, shift_type: shiftType })
      toast.success(`Отправлено в работу: ${r.moved}`)
      navigate('/inwork')
    } catch { toast.error('Не удалось отправить в работу') }
  }

  const onDragEnd = async ({ active, over }) => {
    setActiveId(null)
    const a = active.data.current
    const overId = over?.id
    if (!a || typeof overId !== 'string') return
    const dragged = a.order

    // Куда уронили: на колонку водителя (в конец) или на конкретную карточку (перед ней).
    let targetDriver, beforeId = null
    if (overId.startsWith('driver:')) targetDriver = Number(overId.slice(7))
    else if (overId.startsWith('slot:')) {
      beforeId = Number(overId.slice(5))
      targetDriver = reviewOrders.find((o) => o.id === beforeId)?.assigned_driver_id ?? null
    } else return
    if (!targetDriver || beforeId === dragged.id) return

    const sameColumn = targetDriver === dragged.assigned_driver_id
    // Новый порядок колонки-приёмника: убираем перетаскиваемую, вставляем в нужное место.
    const rest = (ordersByDriver[targetDriver] || []).filter((o) => o.id !== dragged.id)
    let idx = rest.length
    if (beforeId != null) {
      const i = rest.findIndex((o) => o.id === beforeId)
      if (i >= 0) idx = i
    }
    const orderedIds = [...rest.slice(0, idx), dragged, ...rest.slice(idx)].map((o) => o.id)

    try {
      if (!sameColumn) await moveDriver(dragged.id, targetDriver)
      await reorder(orderedIds)
      if (!sameColumn) toast.success(`#${dragged.number} → другому водителю`)
      refresh()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'driver_not_available' ? 'Водитель не на смене в этот день' : 'Ошибка переноса')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferSlots}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={onDragEnd}
    >
      <div className="a-page">
        {/* Шапка на всю ширину: дата + стрелки + смена */}
        <div className="a-page-header" style={{ alignItems: 'center' }}>
          <h2>На проверке <span className="a-count">{reviewOrders.length}</span></h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, -1))} title="День назад">‹</button>
              <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, 1))} title="День вперёд">›</button>
            </div>
            <button className="a-btn a-btn--ghost" onClick={doAutoRoute} disabled={reviewOrders.length === 0}
              title="Проставить порядок исполнения у каждого водителя: районы кучно, сначала доставки (Поставить/Заменить), потом заборы">
              ↧ Авто-порядок
            </button>
            <button className="a-btn a-btn--success" onClick={doSendToWork} disabled={reviewOrders.length === 0}
              title="Отправить всё распределение дня водителям в работу">
              Отправить в Работу →
            </button>
          </div>
        </div>

        {driverCols.length === 0 ? (
          <div className="a-card"><div className="a-empty">На {date} нет распределённых заявок. Назначьте водителей в «Распределении» — заявки появятся здесь сразу.</div></div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 8 }}>
            {driverCols.map((d) => {
              const list = ordersByDriver[d.id] || []
              return (
                <Droppable key={d.id} id={`driver:${d.id}`} className="a-reviewcol" overClassName="is-over">
                  <div className="a-reviewcol-head">
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      <DriverLoad orders={list} />
                    </div>
                    <span className="a-badge" title="заявок">{list.length}</span>
                  </div>
                  <div className="a-reviewcol-body">
                    {list.length === 0 && <div className="a-muted" style={{ fontSize: '0.78rem', padding: '8px 4px' }}>перетащите сюда</div>}
                    {list.map((o, i) => (
                      <Droppable key={o.id} id={`slot:${o.id}`} className="a-slot" overClassName="is-over">
                        <Draggable id={`order:${o.id}`} data={{ kind: 'order', order: o }} className="a-drag">
                          <ReviewCard o={o} seqNo={i + 1} onOpen={openDetail} />
                        </Draggable>
                      </Droppable>
                    ))}
                  </div>
                </Droppable>
              )
            })}
          </div>
        )}
      </div>

      {detailOrder && (
        <OrderModal
          order={detailOrder} types={types}
          onClose={() => setDetailOrder(null)}
          onChanged={() => { refresh(); setDetailOrder(null) }}
        />
      )}

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeOrder && <ReviewCard o={activeOrder} overlay />}
      </DragOverlay>
    </DndContext>
  )
}
