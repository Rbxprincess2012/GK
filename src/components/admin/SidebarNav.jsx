import { Fragment, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical } from 'lucide-react'
import { ITEMS, SECTIONS, CONTAINER_ORDER } from './navConfig'

const ZONE = 'zone:' // префикс id droppable-контейнера, чтобы отличать от пунктов (маршруты с '/')

// ── Обычный режим: двухуровневый аккордеон, ведомый раскладкой ───────────────
export function SidebarNav({ expanded, setExpanded, layout, user, pathname }) {
  const visible = (key) => { const it = ITEMS[key]; return it && (!it.roles || it.roles.includes(user?.role)) }
  // Контейнер-раздел с активной страницей раскрывается сам (пока не тронут вручную).
  const activeKey = CONTAINER_ORDER.find((c) => c !== 'main' && layout[c]?.includes(pathname))
  const [openKeys, setOpenKeys] = useState({})
  const isOpen = (c) => openKeys[c] ?? (c === activeKey)

  const toggleSection = (c) => {
    if (!expanded) { setExpanded(true); setOpenKeys((o) => ({ ...o, [c]: true })) }
    else setOpenKeys((o) => ({ ...o, [c]: !isOpen(c) }))
  }

  return (
    <nav className="a-nav">
      {CONTAINER_ORDER.map((cKey) => {
        const keys = (layout[cKey] || []).filter(visible)

        // «Основные» — ссылки верхнего уровня без аккордеона.
        if (cKey === 'main') {
          return (
            <Fragment key={cKey}>
              {keys.map((key) => {
                const it = ITEMS[key]
                return (
                  <NavLink
                    key={key}
                    to={key}
                    end={it.end}
                    title={!expanded ? it.label : undefined}
                    className={({ isActive }) => 'a-nav-item' + (isActive ? ' active' : '')}
                  >
                    <it.Icon size={18} style={{ flexShrink: 0 }} />
                    {expanded && <span className="a-nav-label">{it.label}</span>}
                  </NavLink>
                )
              })}
            </Fragment>
          )
        }

        if (keys.length === 0) return null
        const sec = SECTIONS[cKey]
        const open = isOpen(cKey)
        const hasActive = keys.includes(pathname)
        const headActive = hasActive && (!expanded || !open)
        return (
          <div key={cKey} className={'a-nav-section' + (sec.bottom ? ' a-nav-section--bottom' : '')}>
            <button
              type="button"
              title={!expanded ? sec.label : undefined}
              onClick={() => toggleSection(cKey)}
              className={'a-nav-item a-nav-head' + (headActive ? ' active' : '')}
            >
              <sec.Icon size={18} style={{ flexShrink: 0 }} />
              {expanded && (
                <>
                  <span className="a-nav-label">{sec.label}</span>
                  <ChevronDown size={15} className={'a-chev' + (open ? ' a-chev--open' : '')} />
                </>
              )}
            </button>
            {expanded && open && (
              <div className="a-nav-children">
                {keys.map((key) => {
                  const it = ITEMS[key]
                  return (
                    <NavLink
                      key={key}
                      to={key}
                      end={it.end}
                      className={({ isActive }) => 'a-nav-item a-nav-child' + (isActive ? ' active' : '')}
                    >
                      <it.Icon size={16} style={{ flexShrink: 0 }} />
                      <span className="a-nav-label">{it.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ── Режим редактирования: перетаскивание пунктов между разделами и внутри ─────
function EditRow({ id }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const it = ITEMS[id]
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="a-nav-item a-nav-editrow">
      <GripVertical size={14} className="a-grip" />
      <it.Icon size={16} style={{ flexShrink: 0 }} />
      <span className="a-nav-label">{it.label}</span>
    </div>
  )
}

function EditZone({ cKey, keys }) {
  const sec = SECTIONS[cKey]
  const { setNodeRef, isOver } = useDroppable({ id: ZONE + cKey })
  return (
    <div className="a-nav-zone">
      <div className="a-nav-zone-label"><sec.Icon size={13} style={{ flexShrink: 0 }} /> {sec.label}</div>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={'a-nav-zone-body' + (isOver ? ' is-over' : '')}>
          {keys.map((key) => <EditRow key={key} id={key} />)}
          {keys.length === 0 && <div className="a-nav-zone-empty">перетащите сюда</div>}
        </div>
      </SortableContext>
    </div>
  )
}

export function SidebarNavEditor({ layout, setLayout, user }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState(null)
  const visible = (key) => { const it = ITEMS[key]; return it && (!it.roles || it.roles.includes(user?.role)) }

  const findContainer = (id) => {
    if (id.startsWith(ZONE)) return id.slice(ZONE.length)
    return CONTAINER_ORDER.find((c) => (layout[c] || []).includes(id)) || null
  }

  const onDragOver = ({ active, over }) => {
    if (!over) return
    const from = findContainer(active.id)
    const to = findContainer(over.id)
    if (!from || !to || from === to) return
    setLayout((prev) => {
      const src = prev[from].filter((k) => k !== active.id)
      const dst = [...prev[to]]
      const idx = over.id.startsWith(ZONE) ? dst.length : dst.indexOf(over.id)
      dst.splice(idx < 0 ? dst.length : idx, 0, active.id)
      return { ...prev, [from]: src, [to]: dst }
    })
  }

  const onDragEnd = ({ active, over }) => {
    setActiveId(null)
    if (!over) return
    const from = findContainer(active.id)
    const to = findContainer(over.id)
    if (!from || !to) return
    if (from === to) {
      const arr = layout[from]
      const oldI = arr.indexOf(active.id)
      const newI = over.id.startsWith(ZONE) ? arr.length - 1 : arr.indexOf(over.id)
      if (oldI !== newI && newI >= 0) setLayout((prev) => ({ ...prev, [from]: arrayMove(prev[from], oldI, newI) }))
    }
  }

  const activeItem = activeId ? ITEMS[activeId] : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <nav className="a-nav a-nav--edit">
        {CONTAINER_ORDER.map((cKey) => (
          <EditZone key={cKey} cKey={cKey} keys={(layout[cKey] || []).filter(visible)} />
        ))}
      </nav>
      <DragOverlay>
        {activeItem && (
          <div className="a-nav-item a-nav-editrow a-nav-editrow--overlay">
            <GripVertical size={14} className="a-grip" />
            <activeItem.Icon size={16} style={{ flexShrink: 0 }} />
            <span className="a-nav-label">{activeItem.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
