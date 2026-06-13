import { useState, useEffect, useCallback, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { Lock, Shuffle, Pencil, Ban, RotateCcw, Copy } from 'lucide-react'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useContainersStore } from '@/store/containersStore'
import { useToast } from '@/components/admin/Toast'
import { Draggable, Droppable, snapCenterToCursor } from '@/components/admin/dnd'
import { OrderModal } from '@/components/admin/OrderModal'
import { DriverLoad } from '@/components/admin/DriverLoad'
import { ContainerJob } from '@/components/admin/ContainerJob'
import { DesiredTime } from '@/components/admin/DesiredTime'
import { isCash, cashLabel } from '@/lib/orderUi'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shiftYmd(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)) }
function tomorrow() { return shiftYmd(ymd(new Date()), 1) }
function clientLegal(o) { return o.client_legal_name || o.client_nickname || '—' }
function objectName(o) { return o.object_name || `Объект #${o.object_id}` }
function addressLine(o) {
  return [o.street_name, o.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ')
    || o.district_alias || o.district || '—'
}

// «В работе» = заявки, отправленные водителям (in_progress). Заблокированы (замок),
// но можно перетаскивать между водителями и менять очередность; точечно — кнопки.
const IN_WORK_STATUSES = ['in_progress']

// Коллизии: курсор над карточкой (slot:) — предпочитаем её колонке (driver:),
// чтобы перетаскивание ВНУТРИ водителя задавало позицию вставки.
function preferSlots(args) {
  const hits = pointerWithin(args)
  const slot = hits.find((h) => String(h.id).startsWith('slot:'))
  return slot ? [slot] : hits
}

function WorkCard({ o, seqNo, overlay, onReassign, onEdit, onCancel, onReturn, onClone }) {
  return (
    <div className={'a-reviewcard a-reviewcard--locked' + (overlay ? ' a-reviewcard--overlay' : '')}>
      <div className="a-reviewcard-top">
        {seqNo != null && <span className="a-reviewcard-seq" title="Очередность исполнения">{seqNo}</span>}
        <span className="a-reviewcard-num">#{o.number}</span>
        {isCash(o) && <span className="a-cash" title="Оплата наличными">{cashLabel(o)}</span>}
        <Lock size={13} className="a-lock" style={{ marginLeft: 'auto' }} />
      </div>
      <div className="a-reviewcard-line a-reviewcard-street">{addressLine(o)}</div>
      <div style={{ margin: '2px 0 4px' }}><DesiredTime time={o.desired_time} compact /></div>
      <div className="a-reviewcard-line">{objectName(o)}</div>
      <ContainerJob o={o} />
      <div className="a-reviewcard-line a-muted">{clientLegal(o)}</div>
      {!overlay && (
        <div className="a-workcard-actions" onPointerDown={(e) => e.stopPropagation()}>
          <button className="a-iconbtn" title="Вернуть на распределение (снять водителя)" onClick={() => onReturn(o)}><RotateCcw size={15} /></button>
          <button className="a-iconbtn" title="Перенести на другую дату / другого водителя" onClick={() => onReassign(o)}><Shuffle size={15} /></button>
          <button className="a-iconbtn" title="Клонировать заявку (новая копия со следующим номером)" onClick={() => onClone(o)}><Copy size={15} /></button>
          <button className="a-iconbtn" title="Изменить заявку" onClick={() => onEdit(o)}><Pencil size={15} /></button>
          <button className="a-iconbtn a-iconbtn--danger" title="Отменить заявку" onClick={() => onCancel(o)}><Ban size={15} /></button>
        </div>
      )}
    </div>
  )
}

export default function InWork() {
  const { orders, fetchOrders, moveDriver, reorder, cancelOrder, getOrder, unassign, addOrder } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  const [date, setDate] = useState(tomorrow())
  const [shiftType] = useState('day') // смена одна (день/ночь убраны)
  const [activeId, setActiveId] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [detailMode, setDetailMode] = useState(null) // null | 'assign' (перенос даты/водителя)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = useCallback(() => { fetchOrders({}); fetchAvailable(date, shiftType) }, [fetchOrders, fetchAvailable, date, shiftType])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchTypes() }, [fetchTypes])

  const workOrders = useMemo(
    () => orders.filter((o) => IN_WORK_STATUSES.includes(o.status) && o.shift_date?.slice(0, 10) === date && o.shift_type === shiftType),
    [orders, date, shiftType])

  const ordersByDriver = useMemo(() => {
    const m = {}
    for (const o of workOrders) if (o.assigned_driver_id) (m[o.assigned_driver_id] ||= []).push(o)
    // Очередность исполнения: по seq, затем по номеру для ещё не упорядоченных.
    for (const k in m) m[k].sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.number - b.number)
    return m
  }, [workOrders])

  // Колонки ТОЛЬКО для водителей с назначенными заявками (без заказов — не показываем).
  const driverCols = useMemo(() => {
    const map = new Map()
    for (const [drvId, list] of Object.entries(ordersByDriver)) {
      const idNum = Number(drvId)
      const av = available.find((d) => d.id === idNum)
      map.set(idNum, { id: idNum, name: av?.name || list[0]?.driver_name || `Водитель #${idNum}`, vehicle_id: av?.vehicle_id ?? list[0]?.vehicle_id })
    }
    return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [available, ordersByDriver])

  const activeOrder = useMemo(() => workOrders.find((o) => `order:${o.id}` === activeId), [workOrders, activeId])

  const openDetail = async (o, m = null) => {
    try { const full = await getOrder(o.id); setDetailOrder({ ...o, ...full }); setDetailMode(m) }
    catch { toast.error('Не удалось открыть заявку') }
  }
  const closeDetail = () => { setDetailOrder(null); setDetailMode(null) }

  const doCancel = async (o) => {
    if (!(await toast.confirm(`Отменить заявку #${o.number}? Водитель уже получил задание — отмена уберёт её из работы (останется в Журнале).`))) return
    try { await cancelOrder(o.id); toast.success(`#${o.number} отменена`); refresh() }
    catch { toast.error('Не удалось отменить') }
  }

  // Клонировать заявку: новая копия в пул (status new) со следующим номером.
  // Копируем объект, оплату, лицо, дату/время, комментарий и позиции (включая № контейнеров).
  const doClone = async (o) => {
    try {
      const created = await addOrder({
        object_id: o.object_id,
        payment_method: o.payment_method,
        amount: o.amount != null ? Number(o.amount) : null,
        trusted_person_id: o.trusted_person_id ?? null,
        desired_date: o.desired_date ? o.desired_date.slice(0, 10) : undefined,
        desired_time: o.desired_time ? String(o.desired_time).slice(0, 5) : undefined,
        note: o.note || undefined,
        items: (o.items || []).map((it) => ({
          action: it.action,
          section_id: it.section_id ?? null,
          quantity: it.quantity,
          container_numbers: it.container_numbers ?? null,
        })),
      })
      toast.success(`Создана копия — заявка #${created.number} (в пуле распределения)`)
      refresh()
    } catch { toast.error('Не удалось клонировать заявку') }
  }

  // Вернуть заявку на распределение: снять водителя/смену → статус new.
  const doReturn = async (o) => {
    if (!(await toast.confirm(`Вернуть заявку #${o.number} на распределение? Водитель снимется, заявка станет нераспределённой.`))) return
    try { await unassign(o.id); toast.success(`#${o.number} возвращена на распределение`); refresh() }
    catch { toast.error('Не удалось вернуть на распределение') }
  }

  // DnD: перенос между водителями (moveDriver) и/или изменение очередности (reorder).
  const onDragEnd = async ({ active, over }) => {
    setActiveId(null)
    const a = active.data.current
    const overId = over?.id
    if (!a || typeof overId !== 'string') return
    const dragged = a.order

    let targetDriver, beforeId = null
    if (overId.startsWith('driver:')) targetDriver = Number(overId.slice(7))
    else if (overId.startsWith('slot:')) {
      beforeId = Number(overId.slice(5))
      targetDriver = workOrders.find((o) => o.id === beforeId)?.assigned_driver_id ?? null
    } else return
    if (!targetDriver || beforeId === dragged.id) return

    const sameColumn = targetDriver === dragged.assigned_driver_id
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
        <div className="a-page-header" style={{ alignItems: 'center' }}>
          <h2>В работе <span className="a-count">{workOrders.length}</span></h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, -1))} title="День назад">‹</button>
              <input className="a-input a-input--accent" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, 1))} title="День вперёд">›</button>
            </div>
          </div>
        </div>

        <div className="a-chip-bar">
          <span className="a-muted" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} /> Отправлено водителям · перетаскивайте между водителями и меняйте очередность
          </span>
        </div>

        {driverCols.length === 0 ? (
          <div className="a-card"><div className="a-empty">На {date} нет заявок в работе. Отправьте распределение из раздела «На проверке».</div></div>
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
                  </div>
                  <div className="a-reviewcol-body">
                    {list.length === 0 && <div className="a-muted" style={{ fontSize: '0.78rem', padding: '8px 4px' }}>перетащите сюда</div>}
                    {list.map((o, i) => (
                      <Droppable key={o.id} id={`slot:${o.id}`} className="a-slot" overClassName="is-over">
                        <Draggable id={`order:${o.id}`} data={{ kind: 'order', order: o }} className="a-drag">
                          <WorkCard o={o} seqNo={i + 1} onReassign={(x) => openDetail(x, 'assign')} onEdit={openDetail} onCancel={doCancel} onReturn={doReturn} onClone={doClone} />
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
          order={detailOrder} types={types} initialMode={detailMode}
          onClose={closeDetail}
          onChanged={() => { refresh(); closeDetail() }}
        />
      )}

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeOrder && <WorkCard o={activeOrder} overlay />}
      </DragOverlay>
    </DndContext>
  )
}
