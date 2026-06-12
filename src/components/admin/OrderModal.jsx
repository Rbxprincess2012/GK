import { useState, useEffect, useCallback } from 'react'
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
import { SectionReview } from '@/components/admin/SectionReview'
import { ReassignModal } from '@/components/admin/ReassignModal'
import { TimeSlotSelect } from '@/components/admin/DesiredTime'
import { STATUS, clientLegal, streetLine, objectLine, ymd, isCash, cashLabel, fmtDesiredTime, yandexMapsUrl } from '@/lib/orderUi'

// Цвет текста статуса в шапке (тон бейджа, но без плашки — меньше визуального шума).
const STATUS_TEXT = { purple: '#a87fff', orange: '#f4a840', green: '#2ecc71', red: '#ff4655' }

// Модалка управления заявкой: просмотр + правка (дата/объект/работы/комментарий) +
// «Отправить в Заявки» (для входящих) + назначение / перенос / завершение / архив +
// приёмка по участкам (статус «Ожидает подтверждения») с кнопкой «Принять заказ».
// props: order (полный, с items), onClose, onChanged
export function OrderModal({ order, onClose, onChanged, initialMode = null }) {
  const { assign, complete, close, accept, updateOrder, cancelOrder, confirm, getOrder } = useOrdersStore()
  const { fetchAvailable, available } = useShiftsStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const { containers, fetchContainers } = useContainersStore()
  const toast = useToast()
  // Локальная копия заявки: перезагружается на месте (приёмка не должна закрывать модалку).
  const [data, setData] = useState(order)
  const o = data
  const [mode, setMode] = useState(initialMode) // 'assign' | 'complete' | 'edit'
  const [editForm, setEditForm] = useState(null)
  const [assignForm, setAssignForm] = useState({
    shift_date: order.shift_date?.slice(0, 10) || ymd(new Date()),
    shift_type: order.shift_type || 'day',
    driver_id: order.assigned_driver_id ? String(order.assigned_driver_id) : '',
  })
  const [movements, setMovements] = useState([])
  const [photoUrl, setPhotoUrl] = useState('')
  const [proofBusy, setProofBusy] = useState(false)
  // Приёмка: локально принятые участки (фиксируются на сервере при «Принять заказ»).
  const [accepted, setAccepted] = useState(() => new Set())
  const [reassign, setReassign] = useState(null) // под-задача в дочерней модалке переназначения

  const reload = useCallback(async () => {
    const full = await getOrder(order.id)
    if (full) {
      setData((d) => ({ ...d, ...full }))
      // Сбрасываем «принято» по участкам, которые больше не done (возвращены на пересъёмку):
      // после переделки тот же участок снова станет done и потребует повторного просмотра пруфа.
      const doneIds = new Set((full.subtasks || []).filter((s) => s.status === 'done').map((s) => s.id))
      setAccepted((acc) => new Set([...acc].filter((id) => doneIds.has(id))))
    }
  }, [order.id, getOrder])

  // ── Приёмка по участкам (awaiting_confirmation) ──
  const toggleAccept = (id) => setAccepted((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const doRejectSection = async (id, comment) => {
    setProofBusy(true)
    try { await api.post(`/subtasks/${id}/reject`, { comment }); toast.success('Возвращено водителю на пересъёмку'); await reload() }
    catch { toast.error('Не удалось вернуть') }
    finally { setProofBusy(false) }
  }

  // ── Приёмка пруфов на странице «Проверка пруфов» (другие статусы) ──
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
    const onShiftDrv = available.find((d) => d.id === id)
    const drv = drivers.find((d) => d.id === id)
    try {
      await assign(order.id, {
        driver_id: id,
        shift_date: assignForm.shift_date,
        shift_type: assignForm.shift_type,
        vehicle_id: onShiftDrv?.vehicle_id ?? drv?.default_vehicle_id ?? null,
      })
      toast.success(o.status === 'new' ? 'Назначено' : 'Перенесено'); onChanged()
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

  // «Завершить работу над заявкой и оповестить клиента»: заявка → done, пруфы приняты,
  // отчёт по шаблону автоматически уходит в Telegram-чат(ы) клиента (бот уже в группе).
  const doConfirm = async () => {
    try {
      const res = await confirm(order.id)
      const d = res?.delivery
      if (d && d.recipients > 0) toast.success(`Готово. Отчёт отправлен: ${d.sent}${d.failed ? `, ошибок ${d.failed}` : ''}`)
      else toast.success('Готово. Получателей в Telegram пока нет — добавьте нашего бота в чат клиента в Настройках.')
      onChanged()
    } catch { toast.error('Не удалось завершить заявку') }
  }

  const doSendToOrders = async () => {
    try { const r = await accept(order.id); toast.success(`Отправлено в Заявки, №${r.number}`); onChanged() }
    catch { toast.error('Не удалось отправить в Заявки') }
  }

  const startEdit = () => {
    setEditForm({
      payment_method: o.payment_method || '',
      amount: o.amount ?? '',
      desired_date: o.desired_date?.slice(0, 10) || '',
      desired_time: o.desired_time?.slice(0, 5) || '',
      note: o.note || '',
      items: (o.items || []).map((it) => ({ action: it.action, quantity: it.quantity ?? 1, section_id: it.section_id ?? null })),
    })
    setMode('edit')
  }

  const doSave = async () => {
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

  // Гейт «Принять заказ»: все выполненные участки приняты локально + нет невыполненных.
  const subs = o.subtasks || []
  const doneSubs = subs.filter((s) => s.status === 'done')
  const notDoneSubs = subs.filter((s) => s.status !== 'done')
  const canConfirm = doneSubs.length > 0 && doneSubs.every((s) => accepted.has(s.id)) && notDoneSubs.length === 0

  const canAssign = ['new', 'assigned', 'in_progress'].includes(o.status)
  const footer = mode ? (
    <>
      <button className="a-btn a-btn--ghost" onClick={() => setMode(null)}>Назад</button>
      {mode === 'assign' && <button className="a-btn a-btn--primary" onClick={doAssign} disabled={!assignForm.driver_id}>Сохранить</button>}
      {mode === 'complete' && <button className="a-btn a-btn--primary" onClick={doComplete}>Завершить</button>}
      {mode === 'edit' && <button className="a-btn a-btn--primary" onClick={doSave} disabled={!editForm?.desired_date}>Сохранить</button>}
    </>
  ) : (
    <>
      {o.status !== 'done' && o.status !== 'closed' && o.status !== 'cancelled' && o.status !== 'awaiting_confirmation' && <button className="a-btn a-btn--ghost" onClick={doArchive}>В архив</button>}
      {o.status !== 'done' && o.status !== 'closed' && o.status !== 'awaiting_confirmation' && <button className="a-btn a-btn--ghost" onClick={startEdit}>✎ Редактировать</button>}
      {o.status === 'pending_review' && <button className="a-btn a-btn--success" onClick={doSendToOrders}>Отправить в Заявки →</button>}
      {canAssign && <button className="a-btn a-btn--primary" onClick={() => setMode('assign')}>{o.status === 'new' ? 'Назначить' : 'Переназначить / перенести'}</button>}
      {(o.status === 'assigned' || o.status === 'in_progress') && <button className="a-btn a-btn--success" onClick={() => setMode('complete')}>Завершить</button>}
      {o.status === 'awaiting_confirmation' && (
        <button className="a-btn a-btn--primary" onClick={doConfirm} disabled={!canConfirm}
          title={!canConfirm ? 'Примите все выполненные участки и разрулите невыполненные' : undefined}>
          Завершить работу над заявкой и оповестить клиента
        </button>
      )}
      {o.status === 'done' && <button className="a-btn a-btn--primary" onClick={doClose}>Закрыть заявку</button>}
    </>
  )

  return (
    <>
    <Modal
      title={<>
        {o.number ? `Заявка #${o.number}` : 'Входящая заявка'}
        {STATUS[o.status] && o.status !== 'awaiting_confirmation' && <span className="a-modal-status" style={{ color: STATUS_TEXT[STATUS[o.status][1]] || '#92a2d4' }}> · {STATUS[o.status][0]}</span>}
        {isCash(o)
          ? <span className="a-cash a-modal-pay">{cashLabel(o)}</span>
          : <span className="a-modal-pay a-inline-meta">Безнал</span>}
      </>}
      onClose={onClose} width={520} footer={footer}
    >
      {!mode && (
        <>
          {/* Поля заявки: ярлык + значение в одну строку (ярлык крупнее, значение мельче) */}
          <div className="a-fields">
            <div className="a-frow">
              <span className="a-frl">Дата заезда</span>
              <span className="a-frv a-frv--split">
                <span>{o.desired_date?.slice(0, 10) || '—'}</span>
                <span className="a-frv-time">{fmtDesiredTime(o.desired_time) || '⚡'}</span>
              </span>
            </div>

            {o.driver_name && (
              <div className="a-frow">
                <span className="a-frl">Водитель</span>
                <span className="a-frv">{o.driver_name}{o.shift_date ? ` · ${o.shift_date.slice(0, 10)}` : ''}</span>
              </div>
            )}

            <div className="a-frow">
              <span className="a-frl">Объект</span>
              <span className="a-frv">
                {objectLine(o)}
                <span className="a-frv-sub">
                  {(() => {
                    const u = yandexMapsUrl(o)
                    return u
                      ? <a href={u} target="_blank" rel="noreferrer" className="a-maplink" title="Открыть точку в Яндекс.Картах">📍 {streetLine(o)}</a>
                      : <>📍 {streetLine(o)}</>
                  })()}
                  {(o.district_alias || o.district) ? ` · ${o.district_alias || o.district}` : ''}
                </span>
              </span>
            </div>

            <div className="a-frow">
              <span className="a-frl">Заказчик</span>
              <span className="a-frv">{clientLegal(o)}</span>
            </div>

            {o.trusted_person_name && (
              <div className="a-frow">
                <span className="a-frl">Контакт</span>
                <span className="a-frv">
                  {o.trusted_person_name}
                  {o.trusted_person_phone && <a href={`tel:${o.trusted_person_phone}`} className="a-frv-phone">{o.trusted_person_phone}</a>}
                </span>
              </div>
            )}
          </div>

          {/* Задание водителю (что взять с базы) — только пока заявка в работе.
              Для отчёта/проверки/закрытых это неактуально — скрываем. */}
          {!['done', 'closed', 'awaiting_confirmation', 'review'].includes(o.status)
            && (o.items?.length > 0 || o.empties > 0 || o.fulls > 0) && (
            <>
              <div className="a-section-title">Участки — задание водителю</div>
              <ContainerJob o={o} />
            </>
          )}

          {/* Приёмка по участкам (Ожидает подтверждения) */}
          {o.status === 'awaiting_confirmation' && subs.length > 0 && (
            <>
              <div className="a-section-title">Приёмка по участкам</div>
              {subs.map((s) => (
                <SectionReview
                  key={s.id}
                  subtask={s}
                  accepted={accepted.has(s.id)}
                  onToggleAccept={toggleAccept}
                  onReject={doRejectSection}
                  onReassign={(st) => setReassign(st)}
                  busy={proofBusy}
                />
              ))}
            </>
          )}

          {/* Проверка пруфов (прочие статусы — очередь «Проверка пруфов») */}
          {o.status !== 'awaiting_confirmation' && o.subtasks?.some((s) => s.status === 'done' || s.attachments?.length) && (
            <>
              <div className="a-section-title">Проверка пруфов</div>
              {o.subtasks.filter((s) => s.status === 'done' || s.attachments?.length).map((s) => (
                <ProofGallery key={s.id} subtask={s} onAccept={doAcceptSub} onReject={doRejectSub} busy={proofBusy} />
              ))}
            </>
          )}

          {/* Комментарий */}
          {o.note && (
            <>
              <div className="a-section-title">Комментарий</div>
              <div className="a-muted" style={{ whiteSpace: 'pre-wrap' }}>{o.note}</div>
            </>
          )}

          {o.movements?.length > 0 && (
            <><div className="a-section-title">Движения контейнеров</div>
              {o.movements.map((m) => (
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
    {/* Вложенные модалки — ПОСЛЕ основной в DOM, чтобы рисовались поверх неё */}
    {reassign && (
      <ReassignModal
        subtask={reassign}
        onClose={() => setReassign(null)}
        onDone={() => { setReassign(null); reload() }}
      />
    )}
    </>
  )
}
