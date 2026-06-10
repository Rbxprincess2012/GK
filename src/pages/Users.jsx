import { useState, useEffect } from 'react'
import { useUsersStore } from '@/store/usersStore'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { PhoneMessengerField, MessengerTag } from '@/components/admin/PhoneMessengerField'

const ROLES = { manager: ['Менеджер', 'purple'], director: ['Директор', 'orange'], superuser: ['Суперпользователь', 'red'] }
const empty = { email: '', last_name: '', first_name: '', phone: '', messengers: [], position: '', avatar: '', role: 'manager' }

const userInitial = (u) => (u.last_name || u.first_name || u.email || '?').trim().charAt(0).toUpperCase()

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function Users() {
  const { users, fetchUsers, addUser, updateUser, toggleActive, resetPassword, removeUser } = useUsersStore()
  const { user: me, assignableRoles } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [search, setSearch] = useState('')
  const [invite, setInvite] = useState(null) // { email, url, kind: 'new' | 'reset' }

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const roleOpts = assignableRoles?.length ? assignableRoles : ['manager']
  const q = search.trim().toLowerCase()
  const filtered = users.filter((u) =>
    !q || `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))

  const open = (u) => {
    setForm(u ? { ...empty, ...u, email: u.email, messengers: u.messengers || [], position: u.position || '', avatar: u.avatar || '' } : { ...empty, role: roleOpts[0] })
    setEditing(u || {})
  }

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // позволить повторно выбрать тот же файл
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Файл больше 2 МБ'); return }
    try { const avatar = await readFileAsDataUrl(file); setForm((f) => ({ ...f, avatar })) }
    catch { toast.error('Не удалось прочитать файл') }
  }

  const save = async () => {
    const person = {
      last_name: form.last_name, first_name: form.first_name,
      phone: form.phone || null, messengers: form.messengers || [],
      position: form.position || null, avatar: form.avatar || null,
      role: form.role,
    }
    try {
      if (editing.id) {
        await updateUser(editing.id, person)
        toast.success('Сохранено')
      } else {
        const { invite_url } = await addUser({ email: form.email, ...person })
        toast.success(`Приглашение для ${form.email} создано`)
        setInvite({ email: form.email, url: invite_url, kind: 'new' })
      }
      setEditing(null)
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(err === 'role_forbidden' ? 'Нельзя назначить эту роль' : err === 'conflict' ? 'Email уже занят' : 'Ошибка сохранения')
    }
  }

  const reset = async (u) => {
    try {
      const url = await resetPassword(u.id)
      toast.success(`Ссылка для смены пароля ${u.email} создана`)
      setInvite({ email: u.email, url, kind: 'reset' })
    } catch { toast.error('Ошибка сброса') }
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
                <td style={{ fontWeight: 600 }}>
                  <span className="a-user-cell">
                    {u.avatar
                      ? <img className="a-user-avatar" src={u.avatar} alt="" />
                      : <span className="a-user-avatar a-user-avatar--ph">{userInitial(u)}</span>}
                    <span className="a-user-cell-text">
                      {[u.last_name, u.first_name].filter(Boolean).join(' ') || '—'}
                      {u.position ? <span className="a-user-pos">{u.position}</span> : null}
                    </span>
                  </span>
                </td>
                <td className="a-muted">
                  {u.email}
                  {!u.activated && <span className="a-badge a-badge--orange" style={{ marginLeft: 8 }} title="Сотрудник ещё не задал пароль по ссылке">не активирован</span>}
                </td>
                <td className="a-muted">
                  {u.phone || '—'}
                  {u.messengers?.length ? <span className="a-user-msgr"><MessengerTag value={u.messengers} /></span> : null}
                </td>
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
          <div className="a-user-form-top">
            <div className="a-avatar-edit">
              {form.avatar
                ? <img className="a-avatar-edit-img" src={form.avatar} alt="" />
                : <span className="a-avatar-edit-img a-avatar-edit-img--ph">{userInitial(form)}</span>}
              <label className="a-btn a-btn--ghost a-btn--sm a-avatar-edit-btn">
                {form.avatar ? 'Заменить' : 'Загрузить'}
                <input type="file" accept="image/*" hidden onChange={onPickAvatar} />
              </label>
              {form.avatar && <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={() => setForm({ ...form, avatar: '' })}>Убрать</button>}
            </div>
            <div className="a-user-form-fields">
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
            </div>
          </div>
          <PhoneMessengerField multi
            phone={form.phone} messengers={form.messengers}
            onChange={({ phone, messengers }) => setForm({ ...form, phone, messengers })}
          />
          <label className="a-field"><span>Должность</span>
            <input className="a-input" value={form.position} placeholder="напр. старший диспетчер"
              onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </label>
          <label className="a-field"><span>Роль</span>
            <select className="a-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOpts.map((r) => <option key={r} value={r}>{ROLES[r]?.[0]}</option>)}
            </select>
          </label>
          {!editing.id && <div className="a-muted" style={{ fontSize: '0.8rem' }}>Сотруднику уйдёт письмо со ссылкой, по которой он сам задаст пароль. Обязателен только email.</div>}
        </Modal>
      )}

      {invite && (
        <Modal
          title={invite.kind === 'reset' ? 'Ссылка для смены пароля' : 'Приглашение сотруднику'}
          onClose={() => setInvite(null)}
          footer={<button className="a-btn a-btn--primary" onClick={() => setInvite(null)}>Готово</button>}
        >
          <div className="a-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
            Письмо со ссылкой отправлено на <b style={{ color: '#e8ecff' }}>{invite.email}</b>.
            Пока почтовая служба не подключена — передайте ссылку сотруднику вручную. Ссылка действует 7 дней.
          </div>
          <label className="a-field"><span>Ссылка для установки пароля</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="a-input" readOnly value={invite.url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
              <button className="a-btn a-btn--ghost" onClick={async () => {
                try { await navigator.clipboard.writeText(invite.url); toast.success('Скопировано') }
                catch { toast.error('Не удалось скопировать') }
              }}>Копировать</button>
            </div>
          </label>
        </Modal>
      )}
    </div>
  )
}
