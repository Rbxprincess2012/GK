import { useRef } from 'react'

// Модалка в стиле дизайн-системы (.a-modal).
export function Modal({ title, onClose, children, footer, width }) {
  // Закрытие по фону — только если И нажатие, И отпускание мыши были на самой подложке.
  // Иначе выделение текста в поле с протяжкой за край модалки ложно закрывало её: событие
  // срабатывало на подложке (общем предке mousedown/mouseup), хотя жест начался внутри поля.
  const downOnBackdrop = useRef(false)
  return (
    <div
      className="a-backdrop"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) onClose() }}
    >
      <div className="a-modal" style={width ? { width } : undefined}>
        <div className="a-modal-header">
          <h3>{title}</h3>
          <button className="a-close" onClick={onClose}>×</button>
        </div>
        <div className="a-modal-body">{children}</div>
        {footer && <div className="a-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
