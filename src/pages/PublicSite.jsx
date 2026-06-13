import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Truck, LogIn } from 'lucide-react'
import { AccountChoiceModal } from '@/components/public/AccountChoiceModal'
import { EmployeeLoginModal } from '@/components/public/EmployeeLoginModal'
import '@/components/public/public.css'

// Публичная витрина putevo.su (гостевой уровень). Шапка с брендом и кнопкой
// «Личный кабинет» → модалка выбора роли → модалка входа сотрудника.
// modal: null | 'choice' | 'login'
export default function PublicSite() {
  const [modal, setModal] = useState(null)

  return (
    <div className="pub-root">
      <header className="pub-header">
        <div className="pub-brand">
          <span className="pub-brand-logo"><Truck size={20} color="#fff" /></span>
          Putevo
        </div>
        <button className="pub-account-btn" onClick={() => setModal('choice')}>
          <LogIn size={16} /> Личный кабинет
        </button>
      </header>

      <main className="pub-hero">
        <h1>Диспетчеризация вывоза отходов</h1>
        <p>
          Заявки, водители, графики и отчёты клиентам — в одной системе.
          Войдите в личный кабинет, чтобы продолжить работу.
        </p>
        <button className="pub-hero-cta" onClick={() => setModal('choice')}>
          <LogIn size={18} /> Войти в личный кабинет
        </button>
      </main>

      <footer className="pub-footer">© {new Date().getFullYear()} Putevo · putevo.su</footer>

      <AnimatePresence>
        {modal === 'choice' && (
          <AccountChoiceModal
            key="choice"
            onClose={() => setModal(null)}
            onEmployee={() => setModal('login')}
          />
        )}
        {modal === 'login' && (
          <EmployeeLoginModal
            key="login"
            onClose={() => setModal(null)}
            onBack={() => setModal('choice')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
