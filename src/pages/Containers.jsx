import { useState, useEffect } from 'react'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const emptyT = { name: '', volume: '' }

// Справочник РАЗМЕРОВ контейнеров. Физический учёт по номерам убран — номер контейнера
// менеджер указывает прямо в заявке. Один размер отмечается «стандартным» (★) — он
// подставляется в позиции заявки по умолчанию.
export default function Containers() {
  const { types, fetchTypes, addType, updateType, removeType, setDefaultType } = useContainersStore()
  const toast = useToast()
  const [tEdit, setTEdit] = useState(null)
  const [tForm, setTForm] = useState(emptyT)

  useEffect(() => { fetchTypes() }, [fetchTypes])

  const saveErr = (e) => {
    const st = e?.response?.status
    if (st === 401 || st === 403) return 'Сессия истекла — обновите страницу (F5) и войдите заново'
    const d = e?.response?.data
    if (d?.error === 'conflict') return 'Такой размер уже есть'
    if (d?.error === 'validation' && Array.isArray(d.issues)) {
      const m = [...new Set(d.issues.map((i) => i.message).filter(Boolean))]
      if (m.length) return m.join('. ')
    }
    return 'Ошибка сохранения'
  }

  const openT = (t) => { setTForm(t ? { ...emptyT, ...t, volume: t.volume ?? '' } : emptyT); setTEdit(t || {}) }
  const saveT = async () => {
    const payload = { name: tForm.name, volume: tForm.volume === '' ? null : Number(tForm.volume) }
    try {
      if (tEdit.id) await updateType(tEdit.id, payload)
      else await addType(payload)
      toast.success('Сохранено'); setTEdit(null)
    } catch (e) { toast.error(saveErr(e)) }
  }
  const delT = async (t) => {
    if (!(await toast.confirm(`Удалить размер «${t.name}»?`))) return
    try { await removeType(t.id); toast.success('Удалено') } catch { toast.error('Нельзя удалить (используется в заявках/контейнерах)') }
  }
  // Сделать размер стандартным (подставляется в заявке по умолчанию).
  const makeDefaultT = async (t) => {
    if (t.is_default) return
    try { await setDefaultType(t.id); toast.success(`«${t.name}» — стандартный размер`) }
    catch { toast.error('Не удалось') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Контейнеры <span className="a-count">{types.length}</span></h2>
        <button className="a-btn a-btn--primary" onClick={() => openT(null)}>+ Размер</button>
      </div>
      <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
        Справочник размеров контейнеров. Звездой ★ отметьте стандартный — он подставится в заявке
        по умолчанию. Номер контейнера менеджер вводит прямо в заявке.
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead><tr><th>Название</th><th>Объём, м³</th><th>По умолч.</th><th></th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td className="a-muted">{t.volume != null ? Number(t.volume) : '—'}</td>
                <td>
                  <button type="button" className="a-star" title={t.is_default ? 'Стандартный размер' : 'Сделать стандартным'}
                    onClick={() => makeDefaultT(t)} style={{ color: t.is_default ? '#f4a840' : '#5b6790' }}>
                    {t.is_default ? '★' : '☆'}
                  </button>
                </td>
                <td>
                  <div className="a-actions">
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openT(t)}>✎</button>
                    <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delT(t)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {types.length === 0 && <tr><td colSpan={4} className="a-loading">Размеров нет — добавьте, напр. «8 м³»</td></tr>}
          </tbody>
        </table>
      </div>

      {tEdit && (
        <Modal
          title={tEdit.id ? tEdit.name : 'Новый размер'}
          onClose={() => setTEdit(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setTEdit(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveT} disabled={!tForm.name}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Название</span>
            <input className="a-input" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="8 м³" />
          </label>
          <label className="a-field"><span>Объём, м³</span>
            <input className="a-input" type="number" step="0.1" value={tForm.volume} onChange={(e) => setTForm({ ...tForm, volume: e.target.value })} placeholder="8" />
          </label>
        </Modal>
      )}
    </div>
  )
}
