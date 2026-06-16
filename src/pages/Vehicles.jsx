import { useState, useEffect } from 'react'
import { useVehiclesStore } from '@/store/vehiclesStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import api from '@/lib/api'

const STATUS = {
  active: ['В строю', 'green'],
  broken: ['Сломана', 'red'],
  repair: ['В ремонте', 'orange'],
}

// kind хранит slug типа машины (из справочника vehicle_types). sizes — выбранные размеры
// контейнеров {container_type_id, is_default} (только для типа с carries_containers).
const empty = { gov_number: '', model: '', kind: '', capacity_slots: 3, empty_capacity: 2, fuel_norm: '', status: 'active', sizes: [] }

export default function Vehicles() {
  const { vehicles, fetchVehicles, addVehicle, updateVehicle, removeVehicle } = useVehiclesStore()
  const { types: contTypes, fetchTypes } = useContainersStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [vtypes, setVtypes] = useState([]) // справочник типов машин

  useEffect(() => { fetchVehicles(); fetchTypes() }, [fetchVehicles, fetchTypes])
  useEffect(() => { api.get('/vehicle-types', { params: { active: 1 } }).then(({ data }) => setVtypes(data)).catch(() => {}) }, [])

  const typeBySlug = (slug) => vtypes.find((t) => t.slug === slug)
  const defaultType = vtypes.find((t) => t.is_default) || vtypes[0]
  const selType = typeBySlug(form.kind) || defaultType
  const carriesContainers = selType ? selType.carries_containers !== false : true

  const open = (v) => {
    const kind = v?.kind || defaultType?.slug || 'container'
    const sizes = (v?.sizes || []).map((s) => ({ container_type_id: s.container_type_id, is_default: !!s.is_default }))
    setForm(v ? { ...empty, ...v, kind, sizes, fuel_norm: v.fuel_norm ?? '' } : { ...empty, kind })
    setEditing(v || {})
  }
  const close = () => setEditing(null)

  // Переключение размера (чекбокс): добавить/убрать из набора. Первый добавленный — основной.
  const toggleSize = (id) => setForm((f) => {
    const has = f.sizes.some((s) => s.container_type_id === id)
    let sizes = has ? f.sizes.filter((s) => s.container_type_id !== id) : [...f.sizes, { container_type_id: id, is_default: false }]
    if (!sizes.some((s) => s.is_default) && sizes.length) sizes = sizes.map((s, i) => ({ ...s, is_default: i === 0 }))
    return { ...f, sizes }
  })
  const setDefaultSize = (id) => setForm((f) => ({ ...f, sizes: f.sizes.map((s) => ({ ...s, is_default: s.container_type_id === id })) }))

  const save = async () => {
    const kind = form.kind || defaultType?.slug || 'container'
    const carries = typeBySlug(kind)?.carries_containers !== false
    const payload = {
      gov_number: form.gov_number,
      model: form.model || undefined,
      kind,
      // Навальному типу контейнерная вместимость и размеры неприменимы.
      capacity_slots: carries ? (Number(form.capacity_slots) || 3) : 1,
      empty_capacity: carries ? (Number(form.empty_capacity) || 2) : 1,
      fuel_norm: form.fuel_norm === '' ? undefined : Number(form.fuel_norm),
      status: form.status,
      sizes: carries ? form.sizes : [],
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

  const sizesLabel = (v) => (v.sizes || []).length
    ? v.sizes.map((s) => `${s.volume ?? s.name}${s.is_default ? '★' : ''}`).join(', ')
    : '—'

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
              <th>Госномер</th><th>Марка</th><th>Тип</th><th>Размеры, м³</th><th>Пустых/рейс</th><th>Норма л/100км</th><th>Статус</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{v.gov_number}</td>
                <td className="a-muted">{v.model || '—'}</td>
                <td>{v.kind_name || typeBySlug(v.kind)?.name || 'Контейнеровоз'}</td>
                <td className="a-muted" title="★ — основной размер">{v.carries_containers === false ? '—' : sizesLabel(v)}</td>
                <td title="Пустых контейнеров за рейс">{v.carries_containers === false ? '—' : (v.empty_capacity ?? 2)}</td>
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
              <tr><td colSpan={8} className="a-loading">Машин пока нет</td></tr>
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
              {vtypes.map((t) => <option key={t.slug} value={t.slug}>{t.name}{t.carries_containers ? '' : ' (вывоз навалом)'}</option>)}
            </select>
          </label>

          {carriesContainers ? (
            <>
              <label className="a-field"><span>Возит размеры контейнеров (★ — основной)</span>
                <div className="a-checks">
                  {contTypes.map((ct) => {
                    const on = form.sizes.some((s) => s.container_type_id === ct.id)
                    const isDef = form.sizes.find((s) => s.container_type_id === ct.id)?.is_default
                    return (
                      <span key={ct.id} className="a-check-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={on} onChange={() => toggleSize(ct.id)} />
                          {ct.name}{ct.volume ? ` (${ct.volume} м³)` : ''}
                        </label>
                        {on && (
                          <button type="button" className={'a-btn a-btn--sm ' + (isDef ? 'a-btn--primary' : 'a-btn--ghost')}
                            onClick={() => setDefaultSize(ct.id)} title="Сделать основным размером">★</button>
                        )}
                      </span>
                    )
                  })}
                  {contTypes.length === 0 && <span className="a-muted">Сначала заведите типы контейнеров (раздел «Контейнеры»).</span>}
                </div>
              </label>
              <label className="a-field"><span>Пустых за рейс</span>
                <input className="a-input" type="number" min={1} value={form.empty_capacity} onChange={(e) => setForm({ ...form, empty_capacity: e.target.value })} />
              </label>
            </>
          ) : (
            <div className="a-note">Машина «{selType?.name}» возит мусор навалом — контейнеры и размеры не нужны.</div>
          )}

          <label className="a-field"><span>Норма л/100км</span>
            <input className="a-input" type="number" value={form.fuel_norm} onChange={(e) => setForm({ ...form, fuel_norm: e.target.value })} />
          </label>
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
