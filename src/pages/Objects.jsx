import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useObjectsStore } from '@/store/objectsStore'
import { useClientsStore } from '@/store/clientsStore'
import { objectAddress, objectLabel as objLabel } from '@/lib/address'

function clientName(o) { return o.client_nickname || o.client_legal_name || `Клиент #${o.client_id}` }

export default function Objects() {
  const { objects, fetchAll, loading } = useObjectsStore()
  const { fetchInventory } = useClientsStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [inv, setInv] = useState({})

  useEffect(() => {
    (async () => {
      const data = await fetchAll({})
      const entries = await Promise.all(data.map(async (o) => [o.id, await fetchInventory(o.id)]))
      setInv(Object.fromEntries(entries))
    })()
  }, [fetchAll, fetchInventory])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => objects.filter((o) =>
    !q || objLabel(o).toLowerCase().includes(q) || clientName(o).toLowerCase().includes(q) || objectAddress(o).toLowerCase().includes(q)
  ), [objects, q])

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Объекты <span className="a-count">{objects.length}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="a-input" style={{ width: 260 }} placeholder="Поиск: объект, клиент, адрес…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>Объект</th><th>Клиент</th><th>Адрес</th><th>Инвентарь</th></tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }} title="Открыть объект на редактирование (в «Клиентах»)"
                onClick={() => navigate(`/clients?client=${o.client_id}&object=${o.id}`)}>
                <td style={{ fontWeight: 600 }}>{objLabel(o)}</td>
                <td className="a-muted">
                  <a className="a-maplink" onClick={(e) => { e.stopPropagation(); navigate(`/clients?client=${o.client_id}`) }}
                    title="Перейти к клиенту">{clientName(o)}</a>
                </td>
                <td className="a-muted">{objectAddress(o)}</td>
                <td>
                  {inv[o.id]?.length
                    ? inv[o.id].map((ct) => (
                        <span key={ct.id} className={`a-inv${ct.state === 'empty' ? ' a-inv--empty' : ''}`}>
                          {ct.type_name}{ct.number ? ` №${ct.number}` : ''}
                        </span>
                      ))
                    : <span className="a-muted" style={{ fontSize: '0.78rem' }}>—</span>}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={4} className="a-loading">Объектов нет</td></tr>}
            {loading && <tr><td colSpan={4} className="a-loading">Загрузка…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
