import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useDriversStore } from '@/store/driversStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { ContainerJob } from '@/components/admin/ContainerJob'
import { ItemsEditor } from '@/components/admin/ItemsEditor'
import { ProofGallery } from '@/components/admin/ProofGallery'
import { ClientMessageModal } from '@/components/admin/ClientMessageModal'
import { DesiredTime, TimeSlotSelect } from '@/components/admin/DesiredTime'
import { STATUS, clientLegal, streetLine, objectLine, ymd, isCash, fmtMoney, yandexMapsUrl } from '@/lib/orderUi'

// Модалка управления заявкой: просмотр + правка (дата/объект/работы/комментарий) +
// «Отправить в Заявки» (для входящих) + назначение / перенос / завершение / архив.
// props: order (полный, с items), onClose, onChanged
export function OrderModal({ order, onClose, onChanged, initialMode = null }) {
  const { assign, complete, close, accept, updateOrder, cancelOrder } = useOrdersStore()
  const { fetchAvailable, available } = useShiftsStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const { containers, fetchContainers } = useContainersStore()
  const toast = useToast()
  const [mode, setMode] = useState(initialMode) // 'assign' | 'complete' | 'edit'
  const [editForm, setEditForm] = useState(null)
  const [assignForm, setAssignForm] = useState({
    shift_date: order.shift_date?.slice(0, 10) || ymd(new Date()),
    shift_type: order.shift_type || 'day',
    driver_id: order.assigned_driver_id ? String(order.assigned_driver_id) : '', // по умолчанию — текущий водитель
  })
  const [movements, setMovements] = useState([])
  const [photoUrl, setPhotoUrl] = useState('')
  const [msgOpen, setMsgOpen] = useState(false)
  const [proofBusy, setProofBusy] = useState(false)

  const doAcceptSub = async (id) => {
    setProofBusy(true)
    try { await api.post(`/subtasks/${id}/accept`); toast.success('Пруф принят'); onChanged() }
    catch { toast.error('Не удалось принять') }
    finally { setProofBusy(false) }
  }
  const doRejectSub = async (id, comment) => {
    setProofBusy(true)
    try { await api.post(`/subtasks/${id}/reject`, { comment }); toast.success('Возвращено водителю на переделку'); onChanged() }
    catch { toast.error('Не удалось вернуть') }
    finally { setProofBusy(false) }
  }

  useEffect(() => {
    if (mode === 'assign') { fetchAvailable(assignForm.shift_date, assignForm.shift_type); fetchDrivers() }
  }, [mode, assignForm.shift_date, assignForm.shift_type, fetchAvailable, fetchDrivers])
  useEffect(() => { if (mode === 'complete') fetchContainers({ object_id: order.object_id }) }, [mode, order.object_id, fetchContainers])

  const doAssign = async () => {
    const id = Number(assignForm.driver_id)
    const onShiftDrv = available.find((d) => d.id === id) // машина смены, если водитель на смене
    const drv = drivers.find((d) => d.id === id)
    try {
      await assign(order.id, {
        driver_id: id,
        shift_date: assignForm.shift_date,
        shift_type: assignForm.shift_type,
        vehicle_id: onShiftDrv?.vehicle_id ?? drv?.default_vehicle_id ?? null,
      })
      toast.success(order.status === 'new' ? 'Назначено' : 'Перенесено'); onChanged()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'driver_not_available' ? 'Водитель недоступен в этот день (отпуск/больничный)' : 'Ошибка назначения')
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

  // «Отправить в Заявки»: входящая (pending_review) → new + номер.
  const doSendToOrders = async () => {
    try { const r = await accept(order.id); toast.success(`Отправлено в Заявки, №${r.number}`); onChanged() }
    catch { toast.error('Не удалось отправить в Заявки') }
  }

  const startEdit = () => {
    setEditForm({
      payment_method: order.payment_method || '',
      amount: order.amount ?? '',
      desired_date: order.desired_date?.slice(0, 10) || '',
      desired_time: order.desired_time?.slice(0, 5) || '',
      note: order.note || '',
      items: (order.items || []).map((it) => ({ action: it.action, quantity: it.quantity ?? 1, section_id: it.section_id ?? null })),
    })
    setMode('edit')
  }

  const doSave = async () => {
    // Позиция = вид работы + количество (тип/класс на заглушке); пустой массив опускаем.
    const items = (editForm.items || [])
      .map((it) => ({ action: it.action, quantity: Math.max(1, Number(it.quantity) || 1), section_id: it.section_id ? Number(it.section_id) : null }))
    try {
      await updateOrder(order.id, {
        payment_method: editForm.payment_method || null,
        amount: editForm.amount === '' || editForm.amount == null ? null : Number(editForm.amount),
        desired_date: editForm.desired_date || null,
        desired_time: editForm.desired_time || null,
        note: editForm.note || null,
        ...(items.length ? { items } : {}),
      })
      toast.success('Заявка обновлена'); onChanged()
    } catch { toast.error('Ошибка сохранения') }
  }

  const doArchive = async () => {
    if (!(await toast.confirm('Убрать заявку в архив? Останется в Журнале, можно вернуть.'))) return
    try { await cancelOrder(order.id); toast.success('Заявка в архиве'); onChanged() }
    catch { toast.error('Не удалось убрать в архив') }
  }

  const canAssign = ['new', 'assigned', 'in_progress'].includes(order.status)
  const footer = mode ? (
    <>
      <button className="a-btn a-btn--ghost" onClick={() => setMode(null)}>Назад</button>
      {mode === 'assign' && <button className="a-btn a-btn--primary" onClick={doAssign} disabled={!assignForm.driver_id}>Сохранить</button>}
      {mode === 'complete' && <button className="a-btn a-btn--primary" onClick={doComplete}>Завершить</button>}
      {mode === 'edit' && <button className="a-btn a-btn--primary" onClick={doSave} disabled={!editForm?.desired_date}>Сохранить</button>}
    </>
  ) : (
    <>
      {order.status !== 'done' && order.status !== 'closed' && order.status !== 'cancelled' && <button className="a-btn a-btn--ghost" onClick={doArchive}>В архив</button>}
      {order.status !== 'done' && order.status !== 'closed' && <button className="a-btn a-btn--ghost" onClick={startEdit}>✎ Редактировать</button>}
      {order.status === 'pending_review' && <button className="a-btn a-btn--success" onClick={doSendToOrders}>Отправить в Заявки →</button>}
      {canAssign && <button className="a-btn a-btn--primary" onClick={() => setMode('assign')}>{order.status === 'new' ? 'Назначить' : 'Переназначить / перенести'}</button>}
      {(order.status === 'assigned' || order.status === 'in_progress') && <button className="a-btn a-btn--success" onClick={() => setMode('complete')}>Завершить</button>}
      {(order.status === 'done' || order.status === 'closed') && <button className="a-btn a-btn--ghost" onClick={() => setMsgOpen(true)}>✉ Сообщить клиенту</button>}
      {order.status === 'done' && <button className="a-btn a-btn--primary" onClick={doClose}>Закрыть заявку</button>}
    </>
  )

  return (
    <>
    {msgOpen && <ClientMessageModal order={order} onClose={() => setMsgOpen(false)} />}
    <Modal title={order.number ? `Заявка #${order.number}` : 'Входящая заявка'} onClose={onClose} width={520} footer={footer}>
      {!mode && (
        <>
          {/* Заявка · дата заезда · водитель */}
          <div className="a-muted" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Дата заезда: <b style={{ color: '#c4d0ff' }}>{order.desired_date?.slice(0, 10) || '—'}</b>
              <DesiredTime time={order.desired_time} />
            </span>
            {order.driver_name && <span>Водитель: <b style={{ color: '#c4d0ff' }}>{order.driver_name}</b>{order.shift_date ? ` · ${order.shift_date.slice(0, 10)}` : ''}</span>}
          </div>

          {/* Статус · вид оплаты */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className={`a-badge a-badge--${STATUS[order.status]?.[1]}`}>{STATUS[order.status]?.[0]}</span>
            {isCash(order)
              ? <span className="a-cash a-cash--lg">💵 НАЛИЧНЫЕ{order.amount != null ? ` · ${fmtMoney(order.amount)}` : ' · сумма не указана'}</span>
              : <span className="a-muted">Безнал</span>}
          </div>

          {/* Объект + адрес */}
          <div className="a-section-title" style={{ marginTop: 0 }}>Объект</div>
          <div style={{ marginBottom: 4 }}><b style={{ color: '#e8ecff' }}>{objectLine(order)}</b></div>
          <div className="a-muted" style={{ marginBottom: 10 }}>
            {(() => {
              const u = yandexMapsUrl(order)
              return u
                ? <a href={u} target="_blank" rel="noreferrer" className="a-maplink" title="Открыть точку в Яндекс.Картах">📍 {streetLine(order)}</a>
                : <>📍 {streetLine(order)}</>
            })()}
            {(order.district_alias || order.district) ? ` · ${order.district_alias || order.district}` : ''}
          </div>

          {/* Заказчик + доверенное лицо (телефон кликабельный) */}
          <div className="a-muted" style={{ marginBottom: 4 }}>Заказчик: <b style={{ color: '#c4d0ff' }}>{clientLegal(order)}</b></div>
          {order.trusted_person_name && (
            <div className="a-muted" style={{ marginBottom: 10 }}>
              Контакт: <b style={{ color: '#c4d0ff' }}>{order.trusted_person_name}</b>
              {order.trusted_person_phone ? <> · <a href={`tel:${order.trusted_person_phone}`} className="a-maplink">{order.trusted_person_phone}</a></> : ''}
            </div>
          )}

          {/* Участки / действия + плашка + рейсы */}
          {(order.items?.length > 0 || order.empties > 0 || order.fulls > 0) && (
            <>
              <div className="a-section-title">Участки — задание водителю</div>
              <ContainerJob o={order} />
            </>
          )}

          {/* Проверка пруфов по участкам */}
          {order.subtasks?.some((s) => s.status === 'done' || s.attachments?.length) && (
            <>
              <div className="a-section-title">Проверка пруфов</div>
              {order.subtasks.filter((s) => s.status === 'done' || s.attachments?.length).map((s) => (
                <ProofGallery key={s.id} subtask={s} onAccept={doAcceptSub} onReject={doRejectSub} busy={proofBusy} />
              ))}
            </>
          )}

          {/* Комментарий */}
          <div className="a-section-title">Комментарий</div>
          <div className="a-muted" style={{ whiteSpace: 'pre-wrap' }}>{order.note || '—'}</div>

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
          <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
            Поменяйте дату заезда и/или водителя. По умолчанию остаётся текущий водитель.
          </div>
          <div className="a-field-row">
            <label className="a-field"><span>Дата заезда</span>
              <input className="a-input" type="date" value={assignForm.shift_date} onChange={(e) => setAssignForm({ ...assignForm, shift_date: e.target.value })} />
            </label>
            <label className="a-field"><span>Водитель</span>
              <select className="a-select" value={assignForm.driver_id} onChange={(e) => setAssignForm({ ...assignForm, driver_id: e.target.value })}>
                <option value="">— выберите —</option>
                {drivers.filter((d) => d.is_active).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{available.some((a) => a.id === d.id) ? ' · на смене' : ''}</option>
                ))}
              </select>
            </label>
          </div>
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

      {mode === 'edit' && editForm && (
        <>
          <div className="a-field-row">
            <label className="a-field"><span>Дата заезда *</span>
              <input className="a-input" type="date" value={editForm.desired_date} onChange={(e) => setEditForm({ ...editForm, desired_date: e.target.value })} />
            </label>
            <label className="a-field"><span>Желаемое время</span>
              <TimeSlotSelect value={editForm.desired_time} onChange={(v) => setEditForm({ ...editForm, desired_time: v })} />
            </label>
            <label className="a-field"><span>Оплата</span>
              <select className={'a-select' + (editForm.payment_method === 'cash' ? ' a-input--cash' : '')} value={editForm.payment_method} onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}>
                <option value="">Как у клиента</option>
                <option value="cashless">Безнал</option><option value="cash">Нал</option>
              </select>
            </label>
          </div>
          {editForm.payment_method === 'cash' && (
            <label className="a-field a-field--cash">
              <span>💵 Сумма наличными (сколько получит водитель), ₽</span>
              <input className="a-input a-input--cash" type="number" min="0" step="1" inputMode="numeric"
                value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                placeholder="напр. 4500" autoFocus />
            </label>
          )}
          <div className="a-section-title">Контейнеры — что сделать на объекте</div>
          <ItemsEditor
            items={editForm.items}
            onChange={(items) => setEditForm({ ...editForm, items })}
            sections={order.object_sections || []}
          />

          <label className="a-field" style={{ marginTop: 12 }}><span>Комментарий — детали / номера контейнеров</span>
            <textarea className="a-input" rows={3} value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
              placeholder="Напр.: контейнеры №32 и №56, полные, срочно" />
          </label>
        </>
      )}
    </Modal>
    </>
  )
}
