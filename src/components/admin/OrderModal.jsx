import { useState, useEffect } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { STATUS, ACTION, clientName, orderTitle, ymd } from '@/lib/orderUi'

// Переиспользуемая модалка управления заявкой: просмотр + назначение / перенос /
// завершение / закрытие. Используется на странице «Заявки» и в «плане дня» календаря.
// props: order (полный, с items), types, onClose, onChanged
export function OrderModal({ order, types, onClose, onChanged }) {
  const { assign, complete, close, accept } = useOrdersStore()
  const { fetchAvailable, available } = useShiftsStore()
  const { containers, fetchContainers } = useContainersStore()
  const toast = useToast()
  const [mode, setMode] = useState(null) // 'assign' | 'complete'
  const [assignForm, setAssignForm] = useState({
    shift_date: order.shift_date?.slice(0, 10) || ymd(new Date()),
    shift_type: order.shift_type || 'day',
    driver_id: '',
  })
  const [movements, setMovements] = useState([])
  const [photoUrl, setPhotoUrl] = useState('')

  const typeName = (id) => types.find((t) => t.id === id)?.name || `тип#${id}`

  useEffect(() => {
    if (mode === 'assign') fetchAvailable(assignForm.shift_date, assignForm.shift_type)
  }, [mode, assignForm.shift_date, assignForm.shift_type, fetchAvailable])
  useEffect(() => { if (mode === 'complete') fetchContainers({ object_id: order.object_id }) }, [mode, order.object_id, fetchContainers])

  const doAssign = async () => {
    const drv = available.find((d) => d.id === Number(assignForm.driver_id))
    try {
      await assign(order.id, {
        driver_id: Number(assignForm.driver_id),
        shift_date: assignForm.shift_date,
        shift_type: assignForm.shift_type,
        vehicle_id: drv?.vehicle_id ?? null,
      })
      toast.success(order.status === 'new' ? 'Назначено' : 'Перенесено'); onChanged()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'driver_not_available' ? 'Водитель не на смене в этот день' : 'Ошибка назначения')
    }
  }

  const doComplete = async () => {
    const body = {
      movements: movements.filter((m) => m.container_id).map((m) => ({ container_id: Number(m.container_id), direction: m.direction })),
      attachments: photoUrl ? [{ kind: 'photo', file_url: photoUrl }] : [],
    }
    try { await complete(order.id, body); toast.success('Заявка выполнена'); onChanged() }
    catch { toast.error('Ошибка завершения') }
  }

  const doClose = async () => {
    if (!(await toast.confirm('Закрыть заявку? (документы оформлены)'))) return
    try { await close(order.id); toast.success('Закрыта'); onChanged() }
    catch { toast.error('Можно закрыть только выполненную') }
  }

  const doAccept = async () => {
    try { const r = await accept(order.id); toast.success(`Принято, №${r.number}`); onChanged() }
    catch { toast.error('Не удалось принять') }
  }

  const canAssign = order.status === 'new' || order.status === 'assigned'
  const footer = mode ? (
    <>
      <button className="a-btn a-btn--ghost" onClick={() => setMode(null)}>Назад</button>
      {mode === 'assign' && <button className="a-btn a-btn--primary" onClick={doAssign} disabled={!assignForm.driver_id}>Сохранить</button>}
      {mode === 'complete' && <button className="a-btn a-btn--primary" onClick={doComplete}>Завершить</button>}
    </>
  ) : (
    <>
      <button className="a-btn a-btn--ghost" onClick={onClose}>Закрыть окно</button>
      {order.status === 'pending_review' && <button className="a-btn a-btn--success" onClick={doAccept}>✓ Принять</button>}
      {canAssign && <button className="a-btn a-btn--primary" onClick={() => setMode('assign')}>{order.status === 'new' ? 'Назначить' : 'Переназначить / перенести'}</button>}
      {(order.status === 'assigned' || order.status === 'in_progress') && <button className="a-btn a-btn--success" onClick={() => setMode('complete')}>Завершить</button>}
      {order.status === 'done' && <button className="a-btn a-btn--primary" onClick={doClose}>Закрыть заявку</button>}
    </>
  )

  return (
    <Modal title={order.number ? `Заявка #${order.number}` : 'Черновик заявки'} onClose={onClose} width={520} footer={footer}>
      {!mode && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className={`a-badge a-badge--${STATUS[order.status]?.[1]}`}>{STATUS[order.status]?.[0]}</span>
            <span className="a-muted">{order.payment_method === 'cash' ? 'Нал' : 'Безнал'}</span>
          </div>
          <div style={{ marginBottom: 6 }}><b>{clientName(order)}</b></div>
          <div className="a-muted" style={{ marginBottom: 10 }}>{orderTitle(order)} · {order.district_alias || order.district || 'район?'}</div>
          {order.driver_name && <div className="a-muted" style={{ marginBottom: 10 }}>Водитель: {order.driver_name} · {order.shift_date?.slice(0, 10)} ({order.shift_type === 'night' ? 'ночь' : 'день'})</div>}

          <div className="a-section-title">Позиции</div>
          {(order.items || []).map((it) => (
            <div key={it.id} style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <b>{ACTION[it.action]}</b> · {typeName(it.container_type_id)} × {it.quantity}{it.waste_class ? ` · класс ${it.waste_class}` : ''}
            </div>
          ))}
          {order.note && <><div className="a-section-title">Примечание</div><div className="a-muted">{order.note}</div></>}
          {order.movements?.length > 0 && (
            <><div className="a-section-title">Движения контейнеров</div>
              {order.movements.map((m) => (
                <div key={m.id} className="a-muted">{m.direction === 'delivered' ? 'Привезён' : 'Забран'} контейнер #{m.container_id}</div>
              ))}
            </>
          )}
        </>
      )}

      {mode === 'assign' && (
        <>
          <div className="a-field-row">
            <label className="a-field"><span>Дата смены</span>
              <input className="a-input" type="date" value={assignForm.shift_date} onChange={(e) => setAssignForm({ ...assignForm, shift_date: e.target.value, driver_id: '' })} />
            </label>
            <label className="a-field"><span>Смена</span>
              <select className="a-select" value={assignForm.shift_type} onChange={(e) => setAssignForm({ ...assignForm, shift_type: e.target.value, driver_id: '' })}>
                <option value="day">Дневная</option><option value="night">Ночная</option>
              </select>
            </label>
          </div>
          <label className="a-field"><span>Водитель (на смене)</span>
            <select className="a-select" value={assignForm.driver_id} onChange={(e) => setAssignForm({ ...assignForm, driver_id: e.target.value })}>
              <option value="">— выберите —</option>
              {available.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_id ? ` · машина #${d.vehicle_id}` : ' · без машины'}</option>)}
            </select>
          </label>
          {available.length === 0 && <div className="a-empty">На эту смену нет водителей со статусом «на смене». Поставьте их в Графике.</div>}
        </>
      )}

      {mode === 'complete' && (
        <>
          <div className="a-muted" style={{ marginBottom: 8 }}>Зафиксируйте движение контейнеров (необязательно — влияет на инвентарь объекта).</div>
          {movements.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <label className="a-field" style={{ flex: 1 }}><span>Контейнер</span>
                <select className="a-select" value={m.container_id} onChange={(e) => setMovements((arr) => arr.map((x, j) => j === i ? { ...x, container_id: e.target.value } : x))}>
                  <option value="">—</option>
                  {containers.map((c) => <option key={c.id} value={c.id}>№{c.number} ({c.type_name})</option>)}
                </select>
              </label>
              <label className="a-field" style={{ flex: '0 0 130px' }}><span>Направление</span>
                <select className="a-select" value={m.direction} onChange={(e) => setMovements((arr) => arr.map((x, j) => j === i ? { ...x, direction: e.target.value } : x))}>
                  <option value="delivered">Привезли</option><option value="picked_up">Забрали</option>
                </select>
              </label>
              <button className="a-btn a-btn--danger a-btn--sm" style={{ marginBottom: 2 }} onClick={() => setMovements((arr) => arr.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setMovements((arr) => [...arr, { container_id: '', direction: 'picked_up' }])}>+ Движение</button>
          <label className="a-field" style={{ marginTop: 12 }}><span>Ссылка на фотоотчёт</span>
            <input className="a-input" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          </label>
        </>
      )}
    </Modal>
  )
}
