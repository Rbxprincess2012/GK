import { useEffect, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { useOrdersStore } from '@/store/ordersStore'
import { useShiftsStore } from '@/store/shiftsStore'
import { useDriversStore } from '@/store/driversStore'
import { TimeSlotSelect } from '@/components/admin/DesiredTime'
import { DateField } from '@/components/admin/DateField'
import { ymd } from '@/lib/orderUi'

// Вложенная модалка переназначения невыполненного участка (поверх модалки приёмки).
// «Назначить» → участок выносится в отдельную заявку и сразу назначается водителю на дату.
// «Оставить в Заявках в работе» → выносится в отдельную новую заявку в пул (менеджер распределит позже).
// props: subtask, onClose, onDone(result) — родитель перезагружает заявку, onClose закрывает.
export function ReassignModal({ subtask, onClose, onDone }) {
  const { carryOverSubtask } = useOrdersStore()
  const { fetchAvailable, available } = useShiftsStore()
  const { drivers, fetchDrivers } = useDriversStore()
  const toast = useToast()
  const [shiftDate, setShiftDate] = useState(ymd(new Date()))
  const [desiredTime, setDesiredTime] = useState(subtask.desired_time ?? null)
  const [driverId, setDriverId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchAvailable(shiftDate, 'day'); fetchDrivers() }, [shiftDate, fetchAvailable, fetchDrivers])

  const doAssign = async () => {
    const id = Number(driverId)
    const onShift = available.find((d) => d.id === id)
    const drv = drivers.find((d) => d.id === id)
    setBusy(true)
    try {
      const res = await carryOverSubtask(subtask.id, {
        assign: {
          driver_id: id,
          shift_date: shiftDate,
          shift_type: 'day',
          vehicle_id: onShift?.vehicle_id ?? drv?.default_vehicle_id ?? null,
        },
        desired_time: desiredTime,
      })
      toast.success('Участок переназначен — в работе у водителя')
      onDone(res)
    } catch (e) {
      toast.error(e?.response?.data?.error === 'driver_not_available'
        ? 'Водитель недоступен в этот день (отпуск/больничный)'
        : 'Не удалось переназначить')
    } finally { setBusy(false) }
  }

  const doLeaveInTasks = async () => {
    setBusy(true)
    try {
      const res = await carryOverSubtask(subtask.id, { desired_time: desiredTime })
      toast.success(`Готово: отдельная заявка${res?.number ? ` №${res.number}` : ''} в «Заявках в работе»${res?.desired_date ? ` на ${res.desired_date.slice(0, 10)}` : ''}`)
      onDone(res)
    } catch { toast.error('Не удалось оставить в Заявках в работе') }
    finally { setBusy(false) }
  }

  const footer = (
    <>
      <button className="a-btn a-btn--ghost" onClick={onClose} disabled={busy}>Отмена</button>
      <button className="a-btn a-btn--soft" onClick={doLeaveInTasks} disabled={busy}>Оставить в Заявках в работе</button>
      <button className="a-btn a-btn--primary" onClick={doAssign} disabled={!driverId || busy}>Назначить</button>
    </>
  )

  return (
    <Modal title={`Переназначить участок${subtask.section_name ? ` «${subtask.section_name}»` : ''}`} onClose={onClose} width={460} footer={footer}>
      <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
        Выберите дату и водителя — участок сразу уйдёт в работу. Если пока не готовы распределить —
        «Оставить в Заявках в работе»: участок станет отдельной новой заявкой (дата — как у исходной).
      </div>
      <div className="a-field-row">
        <label className="a-field"><span>Дата исполнения</span>
          <DateField value={shiftDate} onChange={setShiftDate} style={{ width: '100%' }} />
        </label>
        <label className="a-field"><span>Время заезда</span>
          <TimeSlotSelect value={desiredTime} onChange={setDesiredTime} />
        </label>
      </div>
      <label className="a-field"><span>Водитель</span>
        <select className="a-select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">— выберите —</option>
          {drivers.filter((d) => d.is_active).map((d) => (
            <option key={d.id} value={d.id}>{d.name}{available.some((a) => a.id === d.id) ? ' · на смене' : ''}</option>
          ))}
        </select>
      </label>
    </Modal>
  )
}
