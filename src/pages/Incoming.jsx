import { useState, useEffect, useCallback, useMemo } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useContainersStore } from '@/store/containersStore'
import { OrderModal } from '@/components/admin/OrderModal'
import { useToast } from '@/components/admin/Toast'
import { clientLegal, streetLine, objectLine } from '@/lib/orderUi'

// Столбцы шапки входящих. value(o) — что сравнивать/показывать; type задаёт способ сортировки.
const COLS = [
  { key: 'object', label: 'Объект', type: 'text', value: objectLine, searchable: true, bold: true },
  { key: 'address', label: 'Адрес', type: 'text', value: streetLine, searchable: true },
  { key: 'client', label: 'Заказчик', type: 'text', value: clientLegal, searchable: true },
  { key: 'date', label: 'Дата заезда', type: 'date', value: (o) => o.desired_date?.slice(0, 10) || '' },
  { key: 'time', label: 'Желаемое время', type: 'date', value: (o) => o.desired_time?.slice(0, 5) || '' },
  { key: 'note', label: 'Комментарий', type: 'text', value: (o) => o.note || '' },
]

export default function Incoming() {
  const { orders, fetchOrders, getOrder, cancelOrder } = useOrdersStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  const [detail, setDetail] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'date', dir: 'asc' })

  const refresh = useCallback(() => fetchOrders({}), [fetchOrders])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchTypes() }, [fetchTypes])

  // Входящие = сырое из мессенджеров, ещё не обработанное менеджером (pending_review).
  const incoming = useMemo(() => orders.filter((o) => o.status === 'pending_review'), [orders])

  // Поиск по объекту/адресу/заказчику + сортировка по выбранному столбцу.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searchCols = COLS.filter((c) => c.searchable)
    const filtered = q
      ? incoming.filter((o) => searchCols.some((c) => String(c.value(o)).toLowerCase().includes(q)))
      : incoming
    const col = COLS.find((c) => c.key === sort.key)
    if (!col) return filtered
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = String(col.value(a) ?? ''), vb = String(col.value(b) ?? '')
      // Пустые значения всегда в конце, независимо от направления.
      if (!va && vb) return 1
      if (va && !vb) return -1
      const cmp = col.type === 'date' ? va.localeCompare(vb) : va.localeCompare(vb, 'ru')
      return cmp * mul
    })
  }, [incoming, query, sort])

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const takeToWork = async (o) => {
    try { const full = await getOrder(o.id); setDetail({ ...o, ...full }) }
    catch { toast.error('Не удалось открыть') }
  }

  const cancel = async (o) => {
    if (!confirm(`Отменить входящую «${objectLine(o)}»?`)) return
    try { await cancelOrder(o.id); toast.success('Входящая отменена'); refresh() }
    catch { toast.error('Не удалось отменить') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Входящие <span className="a-count">{incoming.length}</span></h2>
        <input
          className="a-input" style={{ maxWidth: 280 }} value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: объект, адрес, заказчик…"
        />
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              {COLS.map((c) => {
                const active = sort.key === c.key
                return (
                  <th
                    key={c.key} onClick={() => toggleSort(c.key)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    title="Сортировать"
                  >
                    {c.label}
                    <span className="a-muted" style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </th>
                )
              })}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => takeToWork(o)}>
                <td style={{ fontWeight: 600 }}>{objectLine(o)}</td>
                <td className="a-muted">{streetLine(o)}</td>
                <td className="a-muted">{clientLegal(o)}</td>
                <td className="a-muted">{o.desired_date?.slice(0, 10) || '—'}</td>
                <td className="a-muted">{o.desired_time ? o.desired_time.slice(0, 5) : '—'}</td>
                <td className="a-muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.note || '—'}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="a-btn a-btn--primary a-btn--sm" onClick={() => takeToWork(o)}>Взять в работу</button>
                  <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginLeft: 6 }} onClick={() => cancel(o)}>Отменить</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length + 1} className="a-loading">{query ? 'Ничего не найдено' : 'Входящих нет'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <OrderModal
          order={detail} types={types}
          onClose={() => setDetail(null)}
          onChanged={() => { refresh(); setDetail(null) }}
        />
      )}
    </div>
  )
}
