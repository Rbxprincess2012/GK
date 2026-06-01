import { useState, useEffect } from 'react'
import { useDriversStore } from '@/store/driversStore'
import { useVehiclesStore } from '@/store/vehiclesStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const empty = { name: '', phone: '', is_active: true, default_vehicle_id: '' }

export default function Drivers() {
  const { drivers, fetchDrivers, addDriver, updateDriver, toggleActive, removeDriver } = useDriversStore()
  const { vehicles, fetchVehicles } = useVehiclesStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  useEffect(() => { fetchDrivers(); fetchVehicles() }, [fetchDrivers, fetchVehicles])

  const vehicleLabel = (id) => vehicles.find((v) => v.id === id)?.gov_number || '—'

  const open = (d) => {
    setForm(d ? { ...empty, ...d, default_vehicle_id: d.default_vehicle_id ?? '' } : empty)
    setEditing(d || {})
  }
  const close = () => setEditing(null)

  const save = async () => {
    const payload = {
      name: form.name,
      phone: form.phone || undefined,
      is_active: !!form.is_active,
      default_vehicle_id: form.default_vehicle_id === '' ? null : Number(form.default_vehicle_id),
    }
    try {
      if (editing.id) await updateDriver(editing.id, payload)
      else await addDriver(payload)
      toast.success('Сохранено')
      close()
    } catch { toast.error('Ошибка сохранения') }
  }

  const del = async (d) => {
    if (!(await toast.confirm(`Удалить водителя ${d.name}?`))) return
    try { await removeDriver(d.id); toast.success('Удалено') } catch { toast.error('Ошибка удаления') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Водители <span className="a-count">{drivers.length}</span></h2>
        <button className="a-btn a-btn--primary" onClick={() => open(null)}>+ Водитель</button>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>Имя</th><th>Телефон</th><th>Машина по умолч.</th><th>Активен</th><th></th></tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className={d.is_active ? '' : 'a-row--paused'}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td className="a-muted">{d.phone || '—'}</td>
                <td>{vehicleLabel(d.default_vehicle_id)}</td>
                <td>
                  <span className="a-dot" style={{ background: d.is_active ? '#2ecc71' : '#ff4655' }} />
                </td>
                <td>
                  <div className="a-actions">
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => toggleActive(d.id)}>
                      {d.is_active ? 'В отпуск' : 'Вернуть'}
                    </button>
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => open(d)}>✎</button>
                    <button className="a-btn a-btn--danger a-btn--sm" onClick={() => del(d)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr><td colSpan={5} className="a-loading">Водителей пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.id ? editing.name : 'Новый водитель'}
          onClose={close}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={close}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={save} disabled={!form.name}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>ФИО</span>
            <input className="a-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="a-field"><span>Телефон</span>
            <input className="a-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="a-field"><span>Машина по умолчанию</span>
            <select className="a-select" value={form.default_vehicle_id} onChange={(e) => setForm({ ...form, default_vehicle_id: e.target.value })}>
              <option value="">— нет —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.gov_number}{v.model ? ` · ${v.model}` : ''}</option>)}
            </select>
          </label>
          <label className="a-field a-field--check">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span>Активен</span>
          </label>
        </Modal>
      )}
    </div>
  )
}
