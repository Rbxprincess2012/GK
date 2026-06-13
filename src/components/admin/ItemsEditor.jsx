import { ACTION, ACTIONS } from '@/lib/orderUi'
import { ContainerJob } from '@/components/admin/ContainerJob'

// Редактор позиций заявки: что сделать с контейнерами на объекте.
// Каждая строка = вид работы (Поставить/Заменить/Забрать) + (участок, если есть) + количество.
// Тип контейнера и класс отходов временно убраны («на заглушке») — нигде не показываем.
// value: [{ action, quantity, section_id? }]; onChange(next). sections — участки объекта.
// Номер контейнера значим только когда забираем существующий (Заменить/Забрать).
const needsContainerNo = (action) => action === 'replace' || action === 'haul'

export function ItemsEditor({ items, onChange, sections = [] }) {
  const hasSections = sections.length > 0
  const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, { action: 'haul', quantity: 1, section_id: null, container_numbers: '' }])
  const del = (i) => onChange(items.filter((_, j) => j !== i))

  // Для предпросмотра подставляем имя участка по его id.
  const nameOf = (id) => sections.find((s) => s.id === Number(id))?.name || null
  const previewItems = items.map((it) => ({ ...it, section_name: nameOf(it.section_id) }))

  return (
    <div className="a-items">
      {items.length === 0 && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
          Позиций нет — добавьте, что сделать с контейнерами (или опишите в комментарии).
        </div>
      )}
      {items.map((it, i) => (
        <div className="a-item-row" key={i}>
          <select className="a-select" value={it.action} onChange={(e) => set(i, { action: e.target.value })} title="Вид работы">
            {ACTIONS.map((a) => <option key={a} value={a}>{ACTION[a]}</option>)}
          </select>
          {hasSections && (
            <select className="a-select" value={it.section_id ?? ''} onChange={(e) => set(i, { section_id: e.target.value ? Number(e.target.value) : null })} title="Участок объекта">
              <option value="">весь объект</option>
              {sections.map((s) => <option key={s.id} value={s.id}>📍 {s.name}</option>)}
            </select>
          )}
          {needsContainerNo(it.action) && (
            <input className="a-input" style={{ width: 110 }} value={it.container_numbers ?? ''}
              onChange={(e) => set(i, { container_numbers: e.target.value })}
              placeholder="№ напр. 12, 15" title="Номер(а) контейнера, который забрать/заменить" />
          )}
          <input className="a-input" type="number" min="1" step="1" inputMode="numeric" style={{ width: 70 }}
            value={it.quantity} onChange={(e) => set(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} title="Количество" />
          <button className="a-btn a-btn--danger a-btn--sm" onClick={() => del(i)} title="Удалить позицию">✕</button>
        </div>
      ))}
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={add} style={{ marginTop: 4 }}>+ Позиция</button>
      {items.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="a-muted" style={{ fontSize: '0.74rem', marginBottom: 4 }}>Водитель увидит:</div>
          <ContainerJob o={{ items: previewItems }} />
        </div>
      )}
    </div>
  )
}
