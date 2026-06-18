import { useState, useEffect } from 'react'
import { useContainersStore } from '@/store/containersStore'
import { useObjectsStore } from '@/store/objectsStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const STATE = { empty: ['Пустой', 'green'], full: ['Полный', 'orange'] }
const LOC = {
  warehouse: ['Склад', 'purple'],
  object: ['На объекте', 'green'],
  in_transit: ['В пути', 'orange'],
}

const emptyC = { number: '', type_id: '', state: 'empty', location: 'warehouse', object_id: '' }
const emptyT = { name: '', volume: '' }

function objName(o) {
  if (!o) return ''
  return o.informal_name || [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ') || `#${o.id}`
}

export default function Containers() {
  const {
    containers, types, fetchContainers, fetchTypes,
    addContainer, updateContainer, removeContainer,
    addType, updateType, removeType, setDefaultType,
  } = useContainersStore()
  const { objects, fetchAll } = useObjectsStore()
  const toast = useToast()
  const [tab, setTab] = useState('containers')

  const [cEdit, setCEdit] = useState(null)
  const [cForm, setCForm] = useState(emptyC)
  const [tEdit, setTEdit] = useState(null)
  const [tForm, setTForm] = useState(emptyT)

  useEffect(() => { fetchContainers(); fetchTypes(); fetchAll() }, [fetchContainers, fetchTypes, fetchAll])

  const typeName = (id) => types.find((t) => t.id === id)?.name || '—'

  // Понятное сообщение об ошибке сохранения: 401/403 (истёкшая сессия), конфликт, валидация.
  const saveErr = (e, conflictMsg) => {
    const st = e?.response?.status
    if (st === 401 || st === 403) return 'Сессия истекла — обновите страницу (F5) и войдите заново'
    const d = e?.response?.data
    if (d?.error === 'conflict') return conflictMsg
    if (d?.error === 'validation' && Array.isArray(d.issues)) {
      const m = [...new Set(d.issues.map((i) => i.message).filter(Boolean))]
      if (m.length) return m.join('. ')
    }
    return 'Ошибка сохранения'
  }

  // ── контейнеры ──
  const openC = (c) => { setCForm(c ? { ...emptyC, ...c, object_id: c.object_id ?? '' } : { ...emptyC, type_id: types[0]?.id ?? '' }); setCEdit(c || {}) }
  const saveC = async () => {
    const payload = {
      number: cForm.number,
      type_id: Number(cForm.type_id),
      state: cForm.state,
      location: cForm.location,
      object_id: cForm.location === 'object' && cForm.object_id !== '' ? Number(cForm.object_id) : null,
    }
    try {
      if (cEdit.id) await updateContainer(cEdit.id, payload)
      else await addContainer(payload)
      await fetchContainers()
      toast.success('Сохранено'); setCEdit(null)
    } catch (e) {
      toast.error(saveErr(e, 'Номер уже существует'))
    }
  }
  const delC = async (c) => {
    if (!(await toast.confirm(`Удалить контейнер №${c.number}?`))) return
    try { await removeContainer(c.id); toast.success('Удалено') } catch { toast.error('Нельзя удалить') }
  }

  // ── типы ──
  const openT = (t) => { setTForm(t ? { ...emptyT, ...t, volume: t.volume ?? '' } : emptyT); setTEdit(t || {}) }
  const saveT = async () => {
    const payload = { name: tForm.name, volume: tForm.volume === '' ? null : Number(tForm.volume) }
    try {
      if (tEdit.id) await updateType(tEdit.id, payload)
      else await addType(payload)
      toast.success('Сохранено'); setTEdit(null)
    } catch (e) {
      toast.error(saveErr(e, 'Такой тип уже есть'))
    }
  }
  const delT = async (t) => {
    if (!(await toast.confirm(`Удалить тип «${t.name}»?`))) return
    try { await removeType(t.id); toast.success('Удалено') } catch { toast.error('Нельзя удалить (есть контейнеры)') }
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
        <h2>Контейнеры <span className="a-count">{containers.length}</span></h2>
        {tab === 'containers'
          ? <button className="a-btn a-btn--primary" onClick={() => openC(null)} disabled={!types.length}>+ Контейнер</button>
          : <button className="a-btn a-btn--primary" onClick={() => openT(null)}>+ Тип</button>}
      </div>

      <div className="a-chip-bar">
        <button className={'a-chip' + (tab === 'containers' ? ' active' : '')} onClick={() => setTab('containers')}>Контейнеры</button>
        <button className={'a-chip' + (tab === 'types' ? ' active' : '')} onClick={() => setTab('types')}>Типы ({types.length})</button>
      </div>

      {tab === 'containers' && (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr><th>№</th><th>Тип</th><th>Состояние</th><th>Где</th><th>Объект</th><th></th></tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.number}</td>
                  <td>{c.type_name || typeName(c.type_id)}</td>
                  <td><span className={`a-badge a-badge--${STATE[c.state]?.[1]}`}>{STATE[c.state]?.[0]}</span></td>
                  <td><span className={`a-badge a-badge--${LOC[c.location]?.[1]}`}>{LOC[c.location]?.[0]}</span></td>
                  <td className="a-muted">
                    {c.location === 'object'
                      ? (c.object_name || (c.object_house ? `д. ${c.object_house}` : `#${c.object_id ?? '?'}`))
                      : '—'}
                  </td>
                  <td>
                    <div className="a-actions">
                      <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openC(c)}>✎</button>
                      <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delC(c)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {containers.length === 0 && <tr><td colSpan={6} className="a-loading">Контейнеров нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'types' && (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead><tr><th>Название</th><th>Объём, м³</th><th>По умолч.</th><th></th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td className="a-muted">{t.volume ?? '—'}</td>
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
              {types.length === 0 && <tr><td colSpan={4} className="a-loading">Типов нет — добавьте «Лодочку»</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* модалка контейнера */}
      {cEdit && (
        <Modal
          title={cEdit.id ? `Контейнер №${cEdit.number}` : 'Новый контейнер'}
          onClose={() => setCEdit(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setCEdit(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveC} disabled={!cForm.number || !cForm.type_id}>Сохранить</button>
          </>}
        >
          <div className="a-field-row">
            <label className="a-field"><span>Номер</span>
              <input className="a-input" value={cForm.number} onChange={(e) => setCForm({ ...cForm, number: e.target.value })} />
            </label>
            <label className="a-field"><span>Тип</span>
              <select className="a-select" value={cForm.type_id} onChange={(e) => setCForm({ ...cForm, type_id: e.target.value })}>
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
          <div className="a-field-row">
            <label className="a-field"><span>Состояние</span>
              <select className="a-select" value={cForm.state} onChange={(e) => setCForm({ ...cForm, state: e.target.value })}>
                <option value="empty">Пустой</option><option value="full">Полный</option>
              </select>
            </label>
            <label className="a-field"><span>Местоположение</span>
              <select className="a-select" value={cForm.location} onChange={(e) => setCForm({ ...cForm, location: e.target.value })}>
                <option value="warehouse">Склад</option>
                <option value="object">На объекте</option>
                <option value="in_transit">В пути</option>
              </select>
            </label>
          </div>
          {cForm.location === 'object' && (
            <label className="a-field"><span>Объект</span>
              <select className="a-select" value={cForm.object_id} onChange={(e) => setCForm({ ...cForm, object_id: e.target.value })}>
                <option value="">— выберите —</option>
                {objects.map((o) => <option key={o.id} value={o.id}>{objName(o)} · {o.client_legal_name}</option>)}
              </select>
            </label>
          )}
        </Modal>
      )}

      {/* модалка типа */}
      {tEdit && (
        <Modal
          title={tEdit.id ? tEdit.name : 'Новый тип'}
          onClose={() => setTEdit(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setTEdit(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveT} disabled={!tForm.name}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Название</span>
            <input className="a-input" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="Лодочка" />
          </label>
          <label className="a-field"><span>Объём, м³</span>
            <input className="a-input" type="number" step="0.1" value={tForm.volume} onChange={(e) => setTForm({ ...tForm, volume: e.target.value })} />
          </label>
        </Modal>
      )}
    </div>
  )
}
