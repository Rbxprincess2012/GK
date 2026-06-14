import { useState, useEffect, useMemo, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from '@dnd-kit/core'
import { useShiftsStore } from '@/store/shiftsStore'
import { useDriversStore } from '@/store/driversStore'
import { useToast } from '@/components/admin/Toast'
import { Draggable, Droppable } from '@/components/admin/dnd'

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] // getDay(): 0=Вс
const MON_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WINDOW_DAYS = 21 // сегодня + 20 следующих (в архиве — 21-дневными блоками назад)
// По умолчанию все на смене (present). Клик отмечает отсутствие:
//   Смена → Выходной (absent) → Болеет (sick) → снова Смена.
const NEXT_STATUS = { present: 'absent', absent: 'sick', sick: 'present', vacation: 'present' }
const STATUS = {
  present: ['Смена', '#2ecc71'],
  absent: ['Выходной', '#7c8db5'],
  sick: ['Болеет', '#ff4655'],
  vacation: ['Отпуск', '#f48f1b'],
}

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function surname(name) { return (name || '').trim().split(/\s+/)[0] || name }

export default function Schedule() {
  const { shifts, fetchRange, upsertShift, removeShift } = useShiftsStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const toast = useToast()
  const [shiftType] = useState('day') // смена одна (день/ночь убраны)
  const [activeDrag, setActiveDrag] = useState(null)
  // 0 = текущее окно (сегодня + 20). >0 = архив: N-й 21-дневный блок в прошлом.
  const [pastPage, setPastPage] = useState(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const today0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  // Окно: текущее = сегодня…+20; архив = блок из 21 дня, заканчивающийся вчера и глубже.
  const startDate = useMemo(() => addDays(today0, -pastPage * WINDOW_DAYS), [today0, pastPage])
  const cells = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(startDate, i)), [startDate])
  const isArchive = pastPage > 0
  const from = ymd(cells[0])
  const to = ymd(cells[WINDOW_DAYS - 1])

  const reload = useCallback(() => fetchRange(from, to), [fetchRange, from, to])
  useEffect(() => { fetchDrivers() }, [fetchDrivers])
  useEffect(() => { reload() }, [reload])

  const driverName = useCallback((id) => drivers.find((d) => d.id === id)?.name || `#${id}`, [drivers])
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.is_active).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [drivers])

  // Явные записи (отсутствия/переопределения) текущего типа: ключ `date|driver_id` → статус.
  const statusByKey = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      if (s.shift_type !== shiftType) continue
      m[`${s.date?.slice(0, 10)}|${s.driver_id}`] = s.status
    }
    return m
  }, [shifts, shiftType])

  const todayStr = ymd(new Date())

  const place = async (driverId, date, status = 'present') => {
    try { await upsertShift({ driver_id: driverId, date, shift_type: shiftType, status }); reload() }
    catch { toast.error('Не удалось обновить смену') }
  }
  const remove = async (driverId, date) => {
    try { await removeShift(driverId, date, shiftType); reload() } catch { toast.error('Не удалось убрать') }
  }
  // Клик по водителю в дне: Смена → Выходной → Болеет → Смена.
  // «Смена» по умолчанию = отсутствие записи, поэтому возврат к ней удаляет запись.
  const cycleStatus = async (driverId, date, status) => {
    const next = NEXT_STATUS[status] || 'absent'
    if (next === 'present') await remove(driverId, date)
    else await place(driverId, date, next)
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
    if (isArchive) return // архив только для просмотра
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
          <h2>График смен {isArchive && <span className="a-badge a-badge--orange" style={{ verticalAlign: 'middle' }}>Архив</span>}</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="a-muted" style={{ fontWeight: 600 }}>
              {cells[0].getDate()} {MON_GEN[cells[0].getMonth()]} — {cells[WINDOW_DAYS - 1].getDate()} {MON_GEN[cells[WINDOW_DAYS - 1].getMonth()]}
              {!isArchive && ' · сегодня + 20 дней'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setPastPage((p) => p + 1)} title="Раньше (на 21 день назад)">← раньше</button>
              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setPastPage((p) => Math.max(0, p - 1))} disabled={pastPage === 0} title="Позже">позже →</button>
              {isArchive
                ? <button className="a-btn a-btn--primary a-btn--sm" onClick={() => setPastPage(0)}>К текущему</button>
                : <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setPastPage(1)} title="Смотреть прошедшие графики">Архив</button>}
            </div>
          </div>
        </div>

        <div className="a-chip-bar">
          <span className="a-muted" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
            {isArchive
              ? 'Архив: только просмотр.'
              : 'Все на смене по умолчанию · клик по фамилии: Смена → Выходной → Болеет · перетаскивание тоже работает'}
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
                  <span className="a-namechip-dot" style={{ background: '#f48f1b' }} />
                  {d.name}
                </Draggable>
              ))}
              {activeDrivers.length === 0 && <div className="a-empty">Нет активных водителей</div>}
            </div>
          </Droppable>

          {/* Сетка: сегодня + 14 дней */}
          <div>
            <div className="a-daygrid">
              {cells.map((d) => {
                const key = ymd(d)
                // По умолчанию все активные водители на смене; статус берём из явной записи.
                const roster = activeDrivers.map((dr) => ({ driver_id: dr.id, status: statusByKey[`${key}|${dr.id}`] || 'present' }))
                const onShift = roster.filter((r) => r.status === 'present').length
                return (
                  <Droppable key={key} id={`day:${key}`}
                    className={'a-daycell' + (key === todayStr ? ' a-daycell--today' : '') + (isArchive ? ' a-daycell--archive' : '')}>
                    <div className="a-daycell-head">
                      <span className="a-daycell-date">
                        <b>{d.getDate()}</b> {MON_GEN[d.getMonth()]}
                        <span className="a-daycell-dow">{DOW[d.getDay()]}</span>
                      </span>
                      <span className="a-count" title="на смене">{onShift}</span>
                    </div>
                    <div className="a-daycell-body">
                      {roster.length === 0
                        ? <div className="a-daycell-empty">—</div>
                        : roster.map((s) => {
                            const [label, color] = STATUS[s.status] || STATUS.present
                            // В архиве — только просмотр: статичный чип без drag и клика.
                            if (isArchive) return (
                              <div key={s.driver_id} className={`a-namechip a-namechip--day a-namechip--${s.status}`}
                                title={`${driverName(s.driver_id)} · ${label}`} style={{ cursor: 'default' }}>
                                <span className="a-namechip-dot" style={{ background: color }} />
                                {surname(driverName(s.driver_id))}
                              </div>
                            )
                            return (
                              <Draggable key={s.driver_id} id={`cell:${s.driver_id}:${key}`}
                                data={{ kind: 'cell', driverId: s.driver_id, date: key, status: s.status }}
                                className={`a-drag a-namechip a-namechip--day a-namechip--${s.status}`}
                                title={`${driverName(s.driver_id)} · ${label} (клик — сменить статус)`}
                                onClick={() => cycleStatus(s.driver_id, key, s.status)}>
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
    </DndContext>
  )
}
