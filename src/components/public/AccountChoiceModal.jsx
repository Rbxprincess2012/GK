import { motion } from 'motion/react'
import { X, UserCog, Building2 } from 'lucide-react'

// Модалка «Зайти в личный кабинет как». Две роли: Сотрудник (активна) и Клиент
// (пока неактивна — вернёмся позже). Выбор «Сотрудник» поднимается наверх через
// onEmployee, где витрина открывает модалку входа.
export function AccountChoiceModal({ onClose, onEmployee }) {
  return (
    <div className="pub-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        className="pub-modal"
        style={{ position: 'relative' }}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <button className="pub-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>

        <div className="pub-modal-title">Зайти в личный кабинет как</div>
        <div className="pub-modal-sub">Выберите тип учётной записи</div>

        <div className="pub-choice-grid">
          <button className="pub-choice" onClick={onEmployee}>
            <span className="pub-choice-ico"><UserCog size={22} color="#fff" /></span>
            Сотрудник
          </button>
          <button className="pub-choice pub-choice--soon" disabled title="Скоро">
            <span className="pub-choice-ico"><Building2 size={22} color="#92a2d4" /></span>
            Клиент
            <span className="pub-choice-soon">скоро</span>
          </button>
        </div>
      </motion.div>
    </div>
  )
}
