import { useState, useEffect } from 'react'
import { useVehiclesStore } from '@/store/vehiclesStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const STATUS = {
  active: ['В строю', 'green'],
  broken: ['Сломана', 'red'],
  repair: ['В ремонте', 'orange'],
}

// Тип машины: контейнеровоз (возит контейнеры) или грейфер (грузовик с ковшом, вывоз навалом).
const KIND = { container: 'Контейнеровоз', grapple: 'Грейфер' }

const empty = { gov_number: '', model: '', kind: 'container', capacity_slots: 3, empty_capacity: 2, fuel_norm: '', status: 'active' }

export default function Vehicles() {
  const { vehicles, fetchVehicles, addVehicle, updateVehicle, removeVehicle } = useVehiclesStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const open = (v) => {
    setForm(v ? { ...empty, ...v, fuel_norm: v.fuel_norm ?? '' } : empty)
    setEditing(v || {})
  }
  const close = () => setEditing(null)

  const save = async () => {
    const kind = form.kind === 'grapple' ? 'grapple' : 'container'
    const payload = {
      gov_number: form.gov_number,
      model: form.model || undefined,
      kind,
      // Грейферу контейнерная вместимость неприменима — фиксируем дефолты, чтобы не путать распределение.
      capacity_slots: kind === 'grapple' ? 1 : (Number(form.capacity_slots) || 3),
      empty_capacity: kind === 'grapple' ? 1 : (Number(form.empty_capacity) || 2),
      fuel_norm: form.fuel_norm === '' ? undefined : Number(form.fuel_norm),
      status: form.status,
    }
    try {
      if (editing.id) await updateVehicle(editing.id, payload)
      else await addVehicle(payload)
      toast.success('Сохранено')
      close()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'conflict' ? 'Госномер уже существует' : 'Ошибка сохранения')
    }
  }

  const del = async (v) => {
    if (!(await toast.confirm(`Удалить машину ${v.gov_number}?`))) return
    try { await removeVehicle(v.id); toast.success('Удалено') } catch { toast.error('Ошибка удаления') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Машины <span className="a-count">{vehicles.length}</span></h2>
        <button className="a-btn a-btn--primary" onClick={() => open(null)}>+ Машина</button>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>Госномер</th><th>Марка</th><th>Тип</th><th>Пустых/рейс</th><th>Норма л/100км</th><th>Статус</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{v.gov_number}</td>
                <td className="a-muted">{v.model || '—'}</td>
                <td>{KIND[v.kind] || KIND.container}</td>
                <td title="Пустых контейнеров за рейс (по умолчанию 2)">{v.kind === 'grapple' ? '—' : (v.empty_capacity ?? 2)}</td>
                <td>{v.fuel_norm ?? '—'}</td>
                <td><span className={`a-badge a-badge--${STATUS[v.status]?.[1]}`}>{STATUS[v.status]?.[0]}</span></td>
                <td>
                  <div className="a-actions">
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => open(v)}>✎</button>
                    <button className="a-btn a-btn--danger a-btn--sm" onClick={() => del(v)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr><td colSpan={7} className="a-loading">Машин пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Машина ${editing.gov_number}` : 'Новая машина'}
          onClose={close}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={close}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={save} disabled={!form.gov_number}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Госномер</span>
            <input className="a-input" value={form.gov_number} onChange={(e) => setForm({ ...form, gov_number: e.target.value })} />
          </label>
          <label className="a-field"><span>Марка</span>
            <input className="a-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label className="a-field"><span>Тип машины</span>
            <select className="a-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="container">Контейнеровоз</option>
              <option value="grapple">Грейфер (ковш, вывоз навалом)</option>
            </select>
          </label>
          <div className="a-field-row">
            {form.kind !== 'grapple' && (
              <label className="a-field"><span>Пустых за рейс</span>
                <input className="a-input" type="number" min={1} value={form.empty_capacity} onChange={(e) => setForm({ ...form, empty_capacity: e.target.value })} />
              </label>
            )}
            <label className="a-field"><span>Норма л/100км</span>
              <input className="a-input" type="number" value={form.fuel_norm} onChange={(e) => setForm({ ...form, fuel_norm: e.target.value })} />
            </label>
          </div>
          <label className="a-field"><span>Статус</span>
            <select className="a-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">В строю</option>
              <option value="broken">Сломана</option>
              <option value="repair">В ремонте</option>
            </select>
          </label>
        </Modal>
      )}
    </div>
  )
}
