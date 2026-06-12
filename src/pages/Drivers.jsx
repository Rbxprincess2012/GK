import { useState, useEffect } from 'react'
import { useDriversStore } from '@/store/driversStore'
import { useVehiclesStore } from '@/store/vehiclesStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { PhoneMessengerField, MessengerTag } from '@/components/admin/PhoneMessengerField'
import { formatPhone } from '@/lib/phone'

const empty = { last_name: '', first_name: '', name: '', phone: '', messenger: null, is_active: true, default_vehicle_id: '' }
const fullName = (last, first) => [last, first].map((s) => (s || '').trim()).filter(Boolean).join(' ')

export default function Drivers() {
  const { drivers, fetchDrivers, addDriver, updateDriver, toggleActive, removeDriver, botLink } = useDriversStore()
  const { vehicles, fetchVehicles } = useVehiclesStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [link, setLink] = useState(null)

  useEffect(() => { fetchDrivers(); fetchVehicles() }, [fetchDrivers, fetchVehicles])

  const vehicleLabel = (id) => vehicles.find((v) => v.id === id)?.gov_number || '—'

  const open = (d) => {
    setForm(d ? { ...empty, ...d, default_vehicle_id: d.default_vehicle_id ?? '' } : empty)
    setEditing(d || {})
    setLink(null)
  }
  const close = () => setEditing(null)

  const doLink = async () => {
    try { const r = await botLink(editing.id); setLink(r.url) }
    catch { toast.error('Не удалось сгенерировать ссылку') }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Ссылка скопирована') }
    catch { toast.error('Не удалось скопировать') }
  }

  const save = async () => {
    const payload = {
      last_name: form.last_name?.trim() || null,
      first_name: form.first_name?.trim() || null,
      name: fullName(form.last_name, form.first_name),
      phone: form.phone || null,
      messenger: form.messenger || null,
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
            <tr><th>Имя</th><th>Телефон</th><th>Мессенджер</th><th>Машина по умолч.</th><th>Активен</th><th></th></tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className={d.is_active ? '' : 'a-row--paused'}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td className="a-muted">{d.phone ? formatPhone(d.phone) : '—'}</td>
                <td>{d.messenger ? <MessengerTag value={d.messenger} label /> : <span className="a-muted">—</span>}</td>
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
              <tr><td colSpan={6} className="a-loading">Водителей пока нет</td></tr>
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
            <button className="a-btn a-btn--primary" onClick={save} disabled={!form.last_name || !form.first_name}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Фамилия</span>
            <input className="a-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </label>
          <label className="a-field"><span>Имя</span>
            <input className="a-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </label>
          <PhoneMessengerField
            phone={form.phone} messenger={form.messenger}
            onChange={({ phone, messenger }) => setForm({ ...form, phone, messenger })}
          />
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

          {editing.id && (
            <>
              <div className="a-section-title">Доступ в бот</div>
              <label className="a-field"><span>Личная ссылка привязки (отправьте водителю)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="a-btn a-btn--ghost" onClick={doLink}>{link ? 'Обновить' : 'Сгенерировать ссылку'}</button>
                  {link && <input className="a-input" readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />}
                  {link && <button type="button" className="a-btn a-btn--primary" onClick={copyLink}>Копировать</button>}
                </div>
                {link && <span className="a-muted" style={{ fontSize: '0.74rem', marginTop: 3 }}>По тапу водитель привяжется к боту. Ссылка одноразовая, годна сутки.</span>}
              </label>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
