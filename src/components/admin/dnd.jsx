import { useDraggable, useDroppable } from '@dnd-kit/core'

// Переиспользуемые DnD-примитивы поверх @dnd-kit, стилизованные под .a-*.
// Контекст (DndContext + sensors + DragOverlay) создаётся на странице,
// т.к. логика onDragEnd специфична. Здесь — только узлы и визуальные состояния.

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

export function Droppable({ id, data, children, className = '', overClassName = 'is-over' }) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data })
  return (
    <div ref={setNodeRef} className={className + (isOver && active ? ' ' + overClassName : '')}>
      {children}
    </div>
  )
}
