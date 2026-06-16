import { useState, useEffect, useCallback, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useContainersStore } from '@/store/containersStore'
import { useToast } from '@/components/admin/Toast'
import api from '@/lib/api'
import { Draggable, Droppable, snapCenterToCursor } from '@/components/admin/dnd'
import { Modal } from '@/components/admin/Modal'
import { OrderModal } from '@/components/admin/OrderModal'
import { DriverLoad } from '@/components/admin/DriverLoad'
import { ContainerJob } from '@/components/admin/ContainerJob'
import { DateField } from '@/components/admin/DateField'
import { isCash, cashLabel, fmtDate } from '@/lib/orderUi'

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shiftYmd(s, n) { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)) }
function tomorrow() { return shiftYmd(ymd(new Date()), 1) }
function clientLegal(o) { return o.client_legal_name || o.client_nickname || '—' }
function streetLine(o) {
  return [o.street_name, o.object_house && `д. ${o.object_house}`].filter(Boolean).join(', ') || o.address_raw || o.city || '—'
}
function objectLine(o) { return o.object_name || `Объект #${o.object_id}` }

// Бейдж накопленной нагрузки водителя за окно (балл на смену) относительно среднего по работавшим.
// Помогает решить, кого дозагрузить (зелёный), а кому дать поменьше (янтарный).
function loadTag(h, avg) {
  if (!h || h.shift_days === 0) return { text: 'за 7 дн — рейсов не было', color: '#7d8bbf' }
  const v = h.score_per_shift
  if (avg > 0 && v < avg * 0.85) return { text: `↓ недогружен · ${v}/смену`, color: '#2ecc71' }
  if (avg > 0 && v > avg * 1.15) return { text: `↑ перегружен · ${v}/смену`, color: '#f4a840' }
  return { text: `≈ норма · ${v}/смену`, color: '#92a2d4' }
}

// Компактный «чип», который тащим за курсором (центрируется под ним).
function DragChip({ o }) {
  return (
    <div className="a-dragchip">
      <span className="a-dragchip-num">#{o.number}</span>
      <span className="a-dragchip-text">
        <span className="a-dragchip-street">{streetLine(o)}</span>
        <span className="a-dragchip-obj">{objectLine(o)}</span>
      </span>
    </div>
  )
}

// Для водителя главное — улица: она первой, затем объект, затем заказчик.
function OrderCard({ o, onOpen }) {
  return (
    <div className="a-orderrow">
      <span className="a-orderrow-num">#{o.number}</span>
      <span className="a-orderrow-street" title={streetLine(o)}>
        {o.service_type === 'grapple' && <span style={{ marginRight: 6 }} title="Грейфер — вывоз навалом">🚛</span>}
        {isCash(o) && <span className="a-cash" style={{ marginRight: 6 }} title="Наличные">{cashLabel(o)}</span>}
        {streetLine(o)}
      </span>
      <span className="a-orderrow-obj a-muted" title={objectLine(o)}>{objectLine(o)}</span>
      <span className="a-orderrow-client a-muted" title={clientLegal(o)}>{clientLegal(o)}</span>
      <button
        className="a-orderrow-open"
        title="Открыть заявку — все поля, редактирование, комментарий клиента"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onOpen?.(o) }}
      >✎</button>
    </div>
  )
}

export default function Distribution() {
  const { orders, fetchOrders, assign, unassign, getOrder } = useOrdersStore()
  const { available, fetchAvailable } = useShiftsStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  // Заявки распределяют вечером на следующий день → по умолчанию показываем завтра (Т+1).
  const [date, setDate] = useState(tomorrow())
  const [shiftType] = useState('day') // смена одна (день/ночь убраны)
  const [activeId, setActiveId] = useState(null)
  const [driverModal, setDriverModal] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const [busy, setBusy] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = useCallback(() => { fetchOrders({}); fetchAvailable(date, shiftType) }, [fetchOrders, fetchAvailable, date, shiftType])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchTypes() }, [fetchTypes])

  // В распределении — только заявки, у которых клиент назначил ИМЕННО этот день (дата обязательная).
  const newOrders = useMemo(
    () => orders.filter((o) => o.status === 'new' && o.desired_date?.slice(0, 10) === date),
    [orders, date])

  const byDistrict = useMemo(() => {
    const m = {}
    for (const o of newOrders) { const k = o.city || 'Без населённого пункта'; (m[k] ||= []).push(o) }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [newOrders])

  // Заявки, назначенные на каждого водителя в выбранную дату/смену.
  const ordersByDriver = useMemo(() => {
    const m = {}
    for (const o of orders) {
      // Только распределённые, ещё НЕ отправленные в работу: in_progress живёт на экране
      // «В работе», и «Расформировать» здесь не должно дёргать уже выданные водителю заявки.
      if (o.status === 'assigned' && o.shift_date?.slice(0, 10) === date && o.shift_type === shiftType && o.assigned_driver_id)
        (m[o.assigned_driver_id] ||= []).push(o)
    }
    return m
  }, [orders, date, shiftType])

  // Накопленная нагрузка водителей за скользящие 7 дней (read-only: кого дозагрузить).
  // Перечитываем при смене даты и после изменения назначений (день date входит в окно).
  const [loadHist, setLoadHist] = useState(null)
  const fetchLoadHist = useCallback(() => {
    api.get('/distribution/load-history', { params: { date, days: 7 } })
      .then(({ data }) => setLoadHist(data)).catch(() => setLoadHist(null))
  }, [date])
  useEffect(() => { fetchLoadHist() }, [fetchLoadHist, ordersByDriver])
  const histByDriver = useMemo(() => {
    const m = {}
    for (const h of (loadHist?.drivers || [])) m[h.driver_id] = h
    return m
  }, [loadHist])
  const avgPerShift = loadHist?.avg_per_shift || 0

  const activeOrder = useMemo(() => newOrders.find((o) => `order:${o.id}` === activeId), [newOrders, activeId])

  const openDetail = async (o) => {
    try {
      const full = await getOrder(o.id)
      setDetailOrder({ ...o, ...full })
    } catch { toast.error('Не удалось открыть заявку') }
  }

  const onDragEnd = async ({ active, over }) => {
    setActiveId(null)
    const a = active.data.current
    const overId = over?.id
    if (!a || typeof overId !== 'string' || !overId.startsWith('driver:')) return
    const driverId = Number(overId.slice(7))
    const drv = available.find((d) => d.id === driverId)
    try {
      await assign(a.order.id, { driver_id: driverId, shift_date: date, shift_type: shiftType, vehicle_id: drv?.vehicle_id ?? null })
      toast.success(`#${a.order.number} → ${drv?.name}`)
      refresh()
    } catch { toast.error('Ошибка назначения') }
  }

  const onUnassign = async (o) => {
    try {
      await unassign(o.id)
      toast.success(`#${o.number} снят — снова в нераспределённых`)
      refresh()
    } catch { toast.error('Не удалось снять назначение') }
  }

  // Расформировать все заявки одного водителя обратно в распределение.
  const onUnassignDriver = async (driverId, name) => {
    const list = ordersByDriver[driverId] || []
    if (!list.length) return
    if (!(await toast.confirm(`Расформировать заявки водителя ${name} (${list.length}) обратно в распределение?`))) return
    try {
      for (const o of list) await unassign(o.id)
      toast.success(`Заявки ${name} расформированы`); refresh()
    } catch { toast.error('Не удалось расформировать') }
  }

  // Расформировать заявки у всех водителей на выбранную дату.
  const onUnassignAll = async () => {
    const all = Object.values(ordersByDriver).flat()
    if (!all.length) return
    if (!(await toast.confirm(`Расформировать ВСЕ заявки (${all.length}) у всех водителей на ${fmtDate(date)}?`))) return
    try {
      for (const o of all) await unassign(o.id)
      toast.success('Все заявки расформированы'); refresh()
    } catch { toast.error('Не удалось расформировать') }
  }

  // Подсказка распределения (ничего не назначает до «Применить»).
  const doSuggest = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/distribution/suggest', { date, shift_type: shiftType })
      setSuggestion(data)
      if (!data.assignments.some((a) => a.orders.length)) toast.error('Нечего распределять или нет водителей на смене')
    } catch { toast.error('Не удалось рассчитать распределение') }
    finally { setBusy(false) }
  }
  const applySuggestion = async () => {
    setBusy(true)
    try {
      const assignments = suggestion.assignments
        .filter((a) => a.orders.length)
        .map((a) => ({ driver_id: a.driver_id, order_ids: a.orders.map((o) => o.id) }))
      const { data } = await api.post('/distribution/apply', { date, shift_type: shiftType, assignments })
      toast.success(`Назначено: ${data.assigned}${data.failed.length ? `, ошибок ${data.failed.length}` : ''}`)
      setSuggestion(null)
      refresh()
    } catch { toast.error('Не удалось применить распределение') }
    finally { setBusy(false) }
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
          <h2>Распределение</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, -1))} title="День назад">‹</button>
              <DateField value={date} onChange={setDate} style={{ width: 150 }} />
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ minWidth: 34, padding: '6px 10px', fontSize: '1.1rem', lineHeight: 1 }} onClick={() => setDate(shiftYmd(date, 1))} title="День вперёд">›</button>
            </div>
            <button className="a-btn a-btn--ghost" onClick={() => setDate(tomorrow())} title="К завтрашнему дню">Завтра</button>
            <button className="a-btn a-btn--primary" onClick={doSuggest} disabled={busy || newOrders.length === 0}
              title="Предложить справедливую раскладку по водителям">
              {busy ? '…' : '⚖ Распределить'}
            </button>
          </div>
        </div>

        <div className="a-chip-bar">
          <span className="a-muted" style={{ fontSize: '0.82rem' }}>Перетащите заявку на водителя справа — она появится в «На проверке».</span>
        </div>

        {suggestion && (
          <div className="a-card" style={{ marginBottom: 14, border: '1px solid rgba(244,143,27,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="a-section-title" style={{ margin: 0 }}>Предложенная раскладка</div>
              <span className="a-muted" style={{ fontSize: '0.82rem' }}>
                разброс балла: <b>{suggestion.spread}</b> · вес км: {suggestion.km_weight}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setSuggestion(null)}>Сбросить</button>
                <button className="a-btn a-btn--primary a-btn--sm" onClick={applySuggestion} disabled={busy}>Применить</button>
              </div>
            </div>
            {(!suggestion.base_set || suggestion.no_geo_count > 0) && (
              <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 8, color: '#e0a14b' }}>
                ⚠ {!suggestion.base_set
                  ? 'Адрес базы не задан — баланс только по числу заездов. Укажите базу в «Настройках».'
                  : `${suggestion.no_geo_count} заявок без координат — для них километраж не учтён. Геокодируйте объекты.`}
              </div>
            )}
            {suggestion.unassigned?.length > 0 && (
              <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 8, color: '#e0a14b' }}>
                ⚠ Некому распределить ({suggestion.unassigned.length}): нет машины нужного типа на смене.{' '}
                {suggestion.unassigned.map((u) => `#${u.number}${u.reason === 'no_grapple_vehicle' ? ' (грейфер)' : ' (контейнеровоз)'}`).join(', ')}
              </div>
            )}
            <div className="a-table-wrap" style={{ marginTop: 10 }}>
              <table className="a-table">
                <thead>
                  <tr><th>Водитель</th><th>Заявок</th><th>Заезды</th><th>Км</th><th>Балл</th></tr>
                </thead>
                <tbody>
                  {suggestion.assignments.filter((a) => a.orders.length).map((a) => (
                    <tr key={a.driver_id}>
                      <td style={{ fontWeight: 600 }}>{a.driver_name}</td>
                      <td>{a.orders.length}</td>
                      <td>{a.trips}</td>
                      <td className="a-muted">{a.km}</td>
                      <td className="a-muted">{a.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
              «Применить» назначит заявки водителям. Дальше можно поправить вручную перетаскиванием.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
          {/* заявки по населённым пунктам */}
          <div>
            {byDistrict.length === 0 && <div className="a-card"><div className="a-empty">Нераспределённых заявок нет</div></div>}
            {byDistrict.map(([city, list]) => (
              <div key={city} className="a-card" style={{ marginBottom: 14 }}>
                <div className="a-section-title" style={{ marginTop: 0 }}>{city}</div>
                <div className="a-orderrow a-orderrow--head">
                  <span className="a-orderrow-num">№</span>
                  <span className="a-orderrow-street">Улица</span>
                  <span className="a-orderrow-obj">Объект</span>
                  <span className="a-orderrow-client">Заказчик</span>
                  <span />
                </div>
                {list.map((o) => (
                  <Draggable key={o.id} id={`order:${o.id}`} data={{ kind: 'order', order: o }} className="a-drag">
                    <OrderCard o={o} onOpen={openDetail} />
                  </Draggable>
                ))}
              </div>
            ))}
          </div>

          {/* водители-дроп-зоны */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {available.length === 0 && <div className="a-empty">Никто не на смене. Откройте «График» и поставьте статус «Смена».</div>}
            {available.map((d) => {
              const cnt = (ordersByDriver[d.id] || []).length
              const color = cnt ? '#2ecc71' : '#92a2d4'
              return (
                <Droppable key={d.id} id={`driver:${d.id}`} className="a-driverzone" style={{ cursor: 'pointer' }} onClick={() => setDriverModal(d)} title="Показать заявки водителя">
                  <span className="a-dot" style={{ background: color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <DriverLoad orders={ordersByDriver[d.id] || []} />
                    {(() => {
                      const t = loadTag(histByDriver[d.id], avgPerShift)
                      return (
                        <div className="a-driver-loadtag" style={{ color: t.color }}
                          title="Накопленная нагрузка за последние 7 дней — балл на отработанную смену. Зелёный «недогружен» — можно дозагрузить, янтарный «перегружен» — дать поменьше.">
                          {t.text}
                        </div>
                      )
                    })()}
                  </div>
                  {cnt > 0 && (
                    <button className="a-btn a-btn--ghost a-btn--sm" title="Расформировать заявки этого водителя обратно в распределение"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onUnassignDriver(d.id, d.name) }}>⟲</button>
                  )}
                  <span className="a-badge" style={{ background: `${color}22`, color, borderColor: `${color}55` }} title="заявок назначено">{cnt}</span>
                </Droppable>
              )
            })}
            {Object.values(ordersByDriver).flat().length > 0 && (
              <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginTop: 2 }} onClick={onUnassignAll}
                title="Снять все назначения на эту дату — заявки вернутся в распределение">⟲ Расформировать всё</button>
            )}
          </div>
        </div>
      </div>

      {driverModal && (() => {
        const list = ordersByDriver[driverModal.id] || []
        return (
          <Modal
            title={`${driverModal.name} · ${fmtDate(date)}`}
            onClose={() => setDriverModal(null)} width={840}
          >
            <div className="a-muted" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', marginBottom: 14, fontSize: '0.84rem' }}>
              <span>Заявок: <b>{list.length}</b></span>
              <DriverLoad orders={list} />
            </div>
            {list.length === 0 ? (
              <div className="a-empty">На этого водителя заявок нет</div>
            ) : (
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>№</th><th>Улица</th><th>Объект</th><th>Заказчик</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(o)} title="Открыть заявку — все данные">
                        <td style={{ fontWeight: 700 }}>#{o.number}</td>
                        <td style={{ fontWeight: 600 }}>{streetLine(o)}</td>
                        <td className="a-muted">{objectLine(o)}{o.service_type === 'grapple'
                          ? <div>🚛 Грейфер{Number(o.grapple_runs) > 1 ? ` · ${o.grapple_runs} ходок` : ''}</div>
                          : <ContainerJob o={o} />}</td>
                        <td className="a-muted">{clientLegal(o)}</td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="a-btn a-btn--danger a-btn--sm" onClick={() => onUnassign(o)}>Снять</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
        )
      })()}

      {detailOrder && (
        <OrderModal
          order={detailOrder} types={types}
          onClose={() => setDetailOrder(null)}
          onChanged={() => { refresh(); setDetailOrder(null) }}
        />
      )}

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeOrder && <DragChip o={activeOrder} />}
      </DragOverlay>
    </DndContext>
  )
}
