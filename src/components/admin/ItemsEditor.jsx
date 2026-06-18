import { useEffect } from 'react'
import { ACTION, ACTIONS } from '@/lib/orderUi'
import { ContainerJob } from '@/components/admin/ContainerJob'
import { useContainersStore } from '@/store/containersStore'

// Редактор позиций заявки: что сделать с контейнерами на объекте.
// Каждая строка = вид работы (Установить/Заменить/Забрать) + (участок) + размер + № + количество.
// value: [{ action, quantity, section_id?, container_type_id?, container_numbers? }]; onChange(next).
// Поля, неприменимые к действию, НЕ убираем, а дизейблим — чтобы строки/модалка не «прыгали»:
//   • размер нужен при Установить/Заменить (по нему подбирается машина);
//   • № контейнера нужен при Заменить/Забрать (забираем существующий).
const needsContainerNo = (action) => action === 'replace' || action === 'haul'
const needsSize = (action) => action === 'place' || action === 'replace'

export function ItemsEditor({ items, onChange, sections = [] }) {
  const { types: contTypes, fetchTypes } = useContainersStore()
  useEffect(() => { if (!contTypes.length) fetchTypes() }, [contTypes.length, fetchTypes])
  const hasSections = sections.length > 0
  // Стандартный размер: отмеченный в настройках (is_default), иначе первый из справочника.
  const defaultTypeId = (contTypes.find((t) => t.is_default) || contTypes[0])?.id ?? null

  // Автоподстановка стандартного размера для позиций, где он нужен, но не выбран
  // (стартовая позиция, или справочник догрузился позже). Идемпотентно: после заполнения
  // container_type_id != null → больше не трогаем; для «Забрать» размер не нужен — не трогаем.
  useEffect(() => {
    if (defaultTypeId == null) return
    let changed = false
    const next = items.map((it) => {
      if (needsSize(it.action) && it.container_type_id == null) { changed = true; return { ...it, container_type_id: defaultTypeId } }
      return it
    })
    if (changed) onChange(next)
  }, [defaultTypeId, items, onChange])

  // При смене действия на «нужен размер» подставляем стандартный, если ещё не выбран.
  const set = (i, patch) => onChange(items.map((it, j) => {
    if (j !== i) return it
    const next = { ...it, ...patch }
    if (patch.action && needsSize(patch.action) && !next.container_type_id) next.container_type_id = defaultTypeId
    return next
  }))
  const add = () => onChange([...items, { action: 'place', quantity: 1, section_id: null, container_numbers: '', container_type_id: defaultTypeId }])
  const del = (i) => onChange(items.filter((_, j) => j !== i))

  // Для предпросмотра подставляем имя участка по его id.
  const nameOf = (id) => sections.find((s) => s.id === Number(id))?.name || null
  const previewItems = items.map((it) => ({ ...it, section_name: nameOf(it.section_id) }))
  const grid = 'a-items-grid' + (hasSections ? ' has-sections' : '')

  return (
    <div className="a-items">
      {items.length === 0 && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
          Позиций нет — добавьте, что сделать с контейнерами (или опишите в комментарии).
        </div>
      )}
      {items.length > 0 && (
        <div className={`${grid} a-items-head`}>
          <span>Действие</span>
          {hasSections && <span>Участок</span>}
          <span>Размер</span>
          <span>№ контейнера</span>
          <span>Кол-во</span>
          <span />
        </div>
      )}
      {items.map((it, i) => (
        <div className={grid} key={i}>
          <select className="a-select" value={it.action} onChange={(e) => set(i, { action: e.target.value })} title="Вид работы">
            {ACTIONS.map((a) => <option key={a} value={a}>{ACTION[a]}</option>)}
          </select>
          {hasSections && (
            <select className="a-select" value={it.section_id ?? ''} onChange={(e) => set(i, { section_id: e.target.value ? Number(e.target.value) : null })} title="Участок объекта">
              <option value="">весь объект</option>
              {sections.map((s) => <option key={s.id} value={s.id}>📍 {s.name}</option>)}
            </select>
          )}
          <select className="a-select" value={it.container_type_id ?? ''} disabled={!needsSize(it.action)}
            onChange={(e) => set(i, { container_type_id: e.target.value ? Number(e.target.value) : null })}
            title={needsSize(it.action) ? 'Размер контейнера — по нему подбирается машина' : 'Размер не нужен для «Забрать»'}>
            <option value="">—</option>
            {contTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.volume != null ? `${Number(ct.volume)} м³` : ct.name}</option>)}
          </select>
          <input className="a-input" value={it.container_numbers ?? ''} disabled={!needsContainerNo(it.action)}
            onChange={(e) => set(i, { container_numbers: e.target.value })}
            placeholder="напр. 12, 15" title={needsContainerNo(it.action) ? 'Номер(а) контейнера, который забрать/заменить' : 'Номер не нужен для «Установить»'} />
          <input className="a-input" type="number" min="1" step="1" inputMode="numeric"
            value={it.quantity} onChange={(e) => set(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} title="Количество" />
          <button className="a-x" onClick={() => del(i)} title="Удалить позицию">✕</button>
        </div>
      ))}
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={add} style={{ marginTop: 6 }}>+ Позиция</button>
      {items.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="a-muted" style={{ fontSize: '0.74rem', marginBottom: 4 }}>Водитель увидит:</div>
          <ContainerJob o={{ items: previewItems }} />
        </div>
      )}
    </div>
  )
}
