// Модалка в стиле дизайн-системы (.a-modal).
export function Modal({ title, onClose, children, footer, width }) {
  return (
    <div className="a-backdrop" onClick={onClose}>
      <div className="a-modal" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
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
