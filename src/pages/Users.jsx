import { useState, useEffect } from 'react'
import { useUsersStore } from '@/store/usersStore'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const ROLES = { manager: ['Менеджер', 'purple'], director: ['Директор', 'orange'], superuser: ['Суперпользователь', 'red'] }
const empty = { email: '', last_name: '', first_name: '', phone: '', role: 'manager' }

export default function Users() {
  const { users, fetchUsers, addUser, updateUser, toggleActive, resetPassword, removeUser } = useUsersStore()
  const { user: me, assignableRoles } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const roleOpts = assignableRoles?.length ? assignableRoles : ['manager']
  const q = search.trim().toLowerCase()
  const filtered = users.filter((u) =>
    !q || `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))

  const open = (u) => {
    setForm(u ? { ...empty, ...u, email: u.email } : { ...empty, role: roleOpts[0] })
    setEditing(u || {})
  }

  const save = async () => {
    try {
      if (editing.id) {
        await updateUser(editing.id, { last_name: form.last_name, first_name: form.first_name, phone: form.phone, role: form.role })
        toast.success('Сохранено')
      } else {
        const { password } = await addUser({ email: form.email, last_name: form.last_name, first_name: form.first_name, phone: form.phone, role: form.role })
        toast.success(`Создан ${form.email}${password ? ` · пароль ${password}` : ''}`)
      }
      setEditing(null)
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(err === 'role_forbidden' ? 'Нельзя назначить эту роль' : err === 'conflict' ? 'Email уже занят' : 'Ошибка сохранения')
    }
  }

  const reset = async (u) => {
    try { const pwd = await resetPassword(u.id); toast.success(`Новый пароль ${u.email}: ${pwd}`) }
    catch { toast.error('Ошибка сброса') }
  }
  const toggle = async (u) => {
    try { await toggleActive(u.id, !u.is_active) } catch { toast.error('Ошибка') }
  }
  const del = async (u) => {
    if (!(await toast.confirm(`Удалить пользователя ${u.email}?`))) return
    try { await removeUser(u.id); toast.success('Удалено') }
    catch (e) { toast.error(e?.response?.data?.error === 'cannot_delete_self' ? 'Нельзя удалить себя' : 'Ошибка удаления') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Пользователи <span className="a-count">{users.length}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="a-input" style={{ width: 220 }} placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="a-btn a-btn--primary" onClick={() => open(null)}>+ Пользователь</button>
        </div>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>ФИО</th><th>Email</th><th>Телефон</th><th>Роль</th><th>Активен</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'a-row--paused'}>
                <td style={{ fontWeight: 600 }}>{[u.last_name, u.first_name].filter(Boolean).join(' ') || '—'}</td>
                <td className="a-muted">{u.email}</td>
                <td className="a-muted">{u.phone || '—'}</td>
                <td><span className={`a-badge a-badge--${ROLES[u.role]?.[1]}`}>{ROLES[u.role]?.[0]}</span></td>
                <td><span className="a-dot" style={{ background: u.is_active ? '#2ecc71' : '#ff4655' }} /></td>
                <td>
                  <div className="a-actions">
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => reset(u)} title="Сбросить пароль">↻</button>
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => toggle(u)}>{u.is_active ? '⏸' : '▶'}</button>
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => open(u)}>✎</button>
                    {u.id !== me?.id && <button className="a-btn a-btn--danger a-btn--sm" onClick={() => del(u)}>✕</button>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="a-loading">Пользователей нет</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.id ? (editing.email) : 'Новый пользователь'}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={save} disabled={!form.email}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Email</span>
            <input className="a-input" type="email" value={form.email} disabled={!!editing.id}
              onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.ru" />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>Фамилия</span>
              <input className="a-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </label>
            <label className="a-field"><span>Имя</span>
              <input className="a-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </label>
          </div>
          <label className="a-field"><span>Телефон</span>
            <input className="a-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="a-field"><span>Роль</span>
            <select className="a-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOpts.map((r) => <option key={r} value={r}>{ROLES[r]?.[0]}</option>)}
            </select>
          </label>
          {!editing.id && <div className="a-muted" style={{ fontSize: '0.8rem' }}>Пароль сгенерируется автоматически и покажется один раз.</div>}
        </Modal>
      )}
    </div>
  )
}
