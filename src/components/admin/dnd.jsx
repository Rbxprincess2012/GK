import { useDraggable, useDroppable } from '@dnd-kit/core'
import { getEventCoordinates } from '@dnd-kit/utilities'

// Переиспользуемые DnD-примитивы поверх @dnd-kit, стилизованные под .a-*.
// Контекст (DndContext + sensors + DragOverlay) создаётся на странице,
// т.к. логика onDragEnd специфична. Здесь — только узлы и визуальные состояния.

// Модификатор DragOverlay: клон всегда центрируется под курсором, в какой бы точке
// заявки её ни схватили (иначе клон «съезжает» к левому краю исходной строки).
export function snapCenterToCursor({ activatorEvent, draggingNodeRect, overlayNodeRect, transform }) {
  const rect = overlayNodeRect ?? draggingNodeRect
  if (!rect || !activatorEvent) return transform
  const c = getEventCoordinates(activatorEvent)
  if (!c) return transform
  return {
    ...transform,
    x: transform.x + c.x - rect.left - rect.width / 2,
    y: transform.y + c.y - rect.top - rect.height / 2,
  }
}

export function Draggable({ id, data, children, className = '', as: Tag = 'div', onClick, title }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data })
  return (
    <Tag
      ref={setNodeRef}
      title={title}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={className + (isDragging ? ' is-dragging' : '')}
      style={{ touchAction: 'none' }}
    >
      {children}
    </Tag>
  )
}

export function Droppable({ id, data, children, className = '', overClassName = 'is-over', onClick, style, title }) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={style}
      title={title}
      className={className + (isOver && active ? ' ' + overClassName : '')}
    >
      {children}
    </div>
  )
}
