import { useState, useEffect, useMemo, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useShiftsStore } from '@/store/shiftsStore'
import { useDriversStore } from '@/store/driversStore'
import { useToast } from '@/components/admin/Toast'
import { Draggable, Droppable } from '@/components/admin/dnd'
import { DayModal } from '@/components/admin/DayModal'

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const STATUS_ORDER = ['present', 'sick', 'vacation']
const STATUS = {
  present: ['Смена', '#2ecc71'],
  sick: ['Болеет', '#ff4655'],
  vacation: ['Отпуск', '#f48f1b'],
}

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function mondayOf(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function surname(name) { return (name || '').trim().split(/\s+/)[0] || name }

export default function Schedule() {
  const { shifts, fetchRange, upsertShift, removeShift } = useShiftsStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const toast = useToast()
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [shiftType, setShiftType] = useState('day')
  const [activeDrag, setActiveDrag] = useState(null)
  const [dayOpen, setDayOpen] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // 6-недельная сетка от понедельника
  const gridStart = useMemo(() => mondayOf(month), [month])
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])
  const from = ymd(cells[0])
  const to = ymd(cells[41])

  const reload = useCallback(() => fetchRange(from, to), [fetchRange, from, to])
  useEffect(() => { fetchDrivers() }, [fetchDrivers])
  useEffect(() => { reload() }, [reload])

  const driverName = useCallback((id) => drivers.find((d) => d.id === id)?.name || `#${id}`, [drivers])
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.is_active).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [drivers])

  // shifts текущего типа, сгруппированные по дню, фамилии — по алфавиту
  const byDay = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      if (s.shift_type !== shiftType) continue
      const key = s.date?.slice(0, 10)
      ;(m[key] ||= []).push(s)
    }
    for (const k in m) m[k].sort((a, b) => driverName(a.driver_id).localeCompare(driverName(b.driver_id), 'ru'))
    return m
  }, [shifts, shiftType, driverName])

  const todayStr = ymd(new Date())

  const place = async (driverId, date, status = 'present') => {
    try { await upsertShift({ driver_id: driverId, date, shift_type: shiftType, status }); reload() }
    catch { toast.error('Не удалось добавить в смену') }
  }
  const remove = async (driverId, date) => {
    try { await removeShift(driverId, date, shiftType) } catch { toast.error('Не удалось убрать') }
  }
  const cycleStatus = async (s) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(s.status) + 1) % STATUS_ORDER.length]
    await place(s.driver_id, s.date.slice(0, 10), next)
  }

  const onDragStart = ({ active }) => {
    const a = active.data.current
    setActiveDrag({
      label: surname(driverName(a.driverId)),
      status: a.kind === 'cell' ? a.status : 'present',
    })
  }
  const onDragEnd = async ({ active, over }) => {
    setActiveDrag(null)
    const a = active.data.current
    if (!a) return
    const overId = over?.id
    const targetDate = typeof overId === 'string' && overId.startsWith('day:') ? overId.slice(4) : null
    if (a.kind === 'pool') {
      if (targetDate) await place(a.driverId, targetDate)
    } else if (a.kind === 'cell') {
      if (targetDate) {
        if (targetDate === a.date) return
        await remove(a.driverId, a.date)
        await place(a.driverId, targetDate, a.status)
      } else {
        await remove(a.driverId, a.date) // на пул или мимо сетки → удалить
        reload()
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="a-page">
        <div className="a-page-header">
          <h2>График смен</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 600 }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonth(d) }}>Сегодня</button>
          </div>
        </div>

        <div className="a-chip-bar">
          <button className={'a-chip' + (shiftType === 'day' ? ' active' : '')} onClick={() => setShiftType('day')}>☀ Дневная</button>
          <button className={'a-chip' + (shiftType === 'night' ? ' active' : '')} onClick={() => setShiftType('night')}>☾ Ночная</button>
          <span className="a-muted" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
            Перетащите фамилию в день · клик по фамилии — статус · вытащите в пул, чтобы убрать
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Пул водителей */}
          <Droppable id="pool" className="a-pool">
            <div className="a-pool-hint">Водители</div>
            <div className="a-pool-list">
              {activeDrivers.map((d) => (
                <Draggable key={d.id} id={`pool:${d.id}`} data={{ kind: 'pool', driverId: d.id }}
                  className="a-drag a-namechip" title={d.name}>
                  <span className="a-namechip-dot" style={{ background: '#865fff' }} />
                  {d.name}
                </Draggable>
              ))}
              {activeDrivers.length === 0 && <div className="a-empty">Нет активных водителей</div>}
            </div>
          </Droppable>

          {/* Месячная сетка */}
          <div>
            <div className="a-daygrid" style={{ marginBottom: 8 }}>
              {DOW.map((d) => <div key={d} className="a-daygrid-dow">{d}</div>)}
            </div>
            <div className="a-daygrid">
              {cells.map((d) => {
                const key = ymd(d)
                const inMonth = d.getMonth() === month.getMonth()
                const list = byDay[key] || []
                return (
                  <Droppable key={key} id={`day:${key}`}
                    className={'a-daycell' + (inMonth ? '' : ' a-daycell--out') + (key === todayStr ? ' a-daycell--today' : '')}>
                    <div className="a-daycell-head">
                      <span>{d.getDate()}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {list.length > 0 && <span className="a-count">{list.length}</span>}
                        <button className="a-daycell-btn" title="План дня"
                          onClick={() => setDayOpen(key)}>⤢</button>
                      </span>
                    </div>
                    <div className="a-daycell-body">
                      {list.length === 0
                        ? <div className="a-daycell-empty">—</div>
                        : list.map((s) => {
                            const [label, color] = STATUS[s.status] || STATUS.present
                            return (
                              <Draggable key={s.driver_id} id={`cell:${s.driver_id}:${key}`}
                                data={{ kind: 'cell', driverId: s.driver_id, date: key, status: s.status }}
                                className={`a-drag a-namechip a-namechip--day a-namechip--${s.status}`}
                                title={`${driverName(s.driver_id)} · ${label} (клик — сменить)`}
                                onClick={() => cycleStatus(s)}>
                                <span className="a-namechip-dot" style={{ background: color }} />
                                {surname(driverName(s.driver_id))}
                              </Draggable>
                            )
                          })}
                    </div>
                  </Droppable>
                )
              })}
            </div>

            {/* легенда */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              {Object.entries(STATUS).map(([k, [label, color]]) => (
                <span key={k} className="a-muted" style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="a-dot" style={{ background: color }} />{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div className={`a-namechip a-namechip--${activeDrag.status} a-namechip--overlay`}>
            <span className="a-namechip-dot" style={{ background: (STATUS[activeDrag.status] || STATUS.present)[1] }} />
            {activeDrag.label}
          </div>
        )}
      </DragOverlay>

      {dayOpen && (
        <DayModal date={dayOpen} shiftType={shiftType} onClose={() => setDayOpen(null)} onReload={reload} />
      )}
    </DndContext>
  )
}
