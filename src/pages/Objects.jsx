import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useObjectsStore } from '@/store/objectsStore'
import { useClientsStore } from '@/store/clientsStore'
import { useRefsStore } from '@/store/refsStore'

function clientName(o) { return o.client_nickname || o.client_legal_name || `Клиент #${o.client_id}` }
function objLabel(o) {
  if (o.informal_name) return o.informal_name
  const parts = [o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`].filter(Boolean)
  return parts.join(', ') || `Объект #${o.id}`
}

export default function Objects() {
  const { objects, fetchAll, loading } = useObjectsStore()
  const { fetchInventory } = useClientsStore()
  const { districts, fetchDistricts } = useRefsStore()
  const navigate = useNavigate()
  const [districtId, setDistrictId] = useState('')
  const [search, setSearch] = useState('')
  const [inv, setInv] = useState({})

  useEffect(() => { fetchDistricts() }, [fetchDistricts])

  useEffect(() => {
    (async () => {
      const data = await fetchAll(districtId ? { district_id: districtId } : {})
      const entries = await Promise.all(data.map(async (o) => [o.id, await fetchInventory(o.id)]))
      setInv(Object.fromEntries(entries))
    })()
  }, [fetchAll, fetchInventory, districtId])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => objects.filter((o) =>
    !q || objLabel(o).toLowerCase().includes(q) || clientName(o).toLowerCase().includes(q) || o.street_name?.toLowerCase().includes(q)
  ), [objects, q])

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Объекты <span className="a-count">{objects.length}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="a-select" style={{ width: 200 }} value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
            <option value="">Все районы</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.alias ? ` (${d.alias})` : ''}</option>)}
          </select>
          <input className="a-input" style={{ width: 220 }} placeholder="Поиск: объект, клиент, улица…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>Объект</th><th>Клиент</th><th>Адрес</th><th>Район</th><th>Инвентарь</th></tr>
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
                <td className="a-muted">
                  {[o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`].filter(Boolean).join(', ') || '—'}
                </td>
                <td>{o.district ? <span className="a-badge a-badge--purple">{o.district_alias || o.district}</span> : '—'}</td>
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
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="a-loading">Объектов нет</td></tr>}
            {loading && <tr><td colSpan={5} className="a-loading">Загрузка…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
