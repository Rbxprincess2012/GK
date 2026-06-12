import { useState, useEffect, useCallback, useMemo } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useContainersStore } from '@/store/containersStore'
import { OrderModal } from '@/components/admin/OrderModal'
import { CreateOrderModal } from '@/components/admin/CreateOrderModal'
import { useToast } from '@/components/admin/Toast'
import { STATUS, clientLegal, streetLine, objectLine, isCash, cashLabel } from '@/lib/orderUi'
import { DesiredTime } from '@/components/admin/DesiredTime'

const FILTERS = [['active', 'Новые и на проверке'], ['', 'Все'], ['new', 'Новые'], ['assigned', 'Назначены'], ['review', 'На проверке'], ['done', 'Выполнены'], ['closed', 'Закрыты']]
// Заглушка: счётчики дня (всего / не распределено / просрочено) пока скрыты. Вернуть → true.
const SHOW_DAY_COUNTERS = false
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function dateLabel(d10) {
  const [y, m, dd] = d10.split('-').map(Number)
  return `${dd} ${MON_GEN[m - 1]}, ${DOW[new Date(y, m - 1, dd).getDay()]}`
}

// «Заявки» — обработанные менеджером заявки (доступны для распределения).
// Сгруппированы блоками по дате заезда: ближайшие сверху → будущие ниже,
// в шапке блока видно, сколько на эту дату ещё не распределено.
export default function Orders() {
  const { orders, fetchOrders, getOrder, cancelOrder } = useOrdersStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  // По умолчанию показываем только актуальную работу: новые + на проверке.
  const [filter, setFilter] = useState('active')
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)

  // Тянем все заявки, фильтр применяем на клиенте (он может объединять статусы).
  const refresh = useCallback(() => fetchOrders({}), [fetchOrders])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchTypes() }, [fetchTypes])

  const visible = useMemo(() => {
    const match = (o) =>
      filter === 'active' ? (o.status === 'new' || o.status === 'review')
        : !filter ? true
          : o.status === filter
    return orders.filter((o) => o.status !== 'cancelled' && o.status !== 'pending_review' && match(o))
  }, [orders, filter])

  const todayStr = ymd(new Date())

  // Группировка по дате заезда; свежая дата сверху → старые ниже, без даты — в конце.
  const groups = useMemo(() => {
    const m = {}
    for (const o of visible) { const k = o.desired_date?.slice(0, 10) || ''; (m[k] ||= []).push(o) }
    return Object.keys(m)
      .sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a)))
      .map((date) => ({
        date,
        list: m[date],
        unassigned: m[date].filter((o) => o.status === 'new').length,
      }))
  }, [visible])

  const openDetail = async (o) => {
    const full = await getOrder(o.id)
    setDetail({ ...o, ...full })
  }

  const onArchive = async (e, o) => {
    e.stopPropagation()
    if (!(await toast.confirm(`Убрать заявку ${o.number ? '#' + o.number : ''} в архив? Останется в Журнале.`))) return
    try { await cancelOrder(o.id); toast.success('Заявка в архиве') }
    catch { toast.error('Не удалось убрать в архив') }
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Заявки в работе <span className="a-count">{visible.length}</span></h2>
        <button className="a-btn a-btn--primary" onClick={() => setCreating(true)}>+ Заявка</button>
      </div>

      <div className="a-chip-bar">
        {FILTERS.map(([v, label]) => (
          <button key={v} className={'a-chip' + (filter === v ? ' active' : '')} onClick={() => setFilter(v)}>{label}</button>
        ))}
      </div>

      {groups.length === 0 && <div className="a-card"><div className="a-empty">Заявок нет</div></div>}

      {/* Одна общая таблица на все даты → колонки выровнены между группами.
          Дата заезда — строка-разделитель (colSpan), заявки идут под ней. */}
      {groups.length > 0 && (
        <div className="a-card">
          <div className="a-table-wrap">
            <table className="a-table a-orders-table">
              <thead>
                <tr><th>№</th><th>Объект</th><th>Адрес</th><th>Время</th><th>Заказчик</th><th>Оплата</th><th>Район</th><th>Водитель</th><th>Статус</th><th></th></tr>
              </thead>
              {groups.map(({ date, list, unassigned }, gi) => {
                const overdue = date && date < todayStr
                return (
                  <tbody key={date || 'none'} className="a-day">
                    {gi > 0 && <tr className="a-day-gap"><td colSpan={10} /></tr>}
                    <tr className="a-orders-group-row">
                      <td colSpan={10}>
                        <div className={'a-orders-group-head' + (overdue ? ' is-overdue' : '')}>
                          <span className="a-orders-group-date">{date ? dateLabel(date) : 'Без даты заезда'}</span>
                          {date === todayStr && <span className="a-badge a-badge--purple">сегодня</span>}
                          {SHOW_DAY_COUNTERS && (
                            <>
                              {overdue && <span className="a-badge a-badge--red">просрочено</span>}
                              <span className="a-count" title="всего заявок на дату">{list.length}</span>
                              {unassigned > 0
                                ? <span className="a-badge a-badge--orange" title="ещё не распределены">{unassigned} не распределено</span>
                                : <span className="a-badge a-badge--green" title="все распределены">распределены</span>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {list.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(o)}>
                        <td style={{ fontWeight: 700 }}>{o.number ? `#${o.number}` : <span className="a-muted" style={{ fontWeight: 400 }}>—</span>}</td>
                        <td style={{ fontWeight: 600 }} title={objectLine(o)}>{objectLine(o)}</td>
                        <td className="a-muted" title={streetLine(o)}>{streetLine(o)}</td>
                        <td><DesiredTime time={o.desired_time} compact /></td>
                        <td className="a-muted" title={clientLegal(o)}>{clientLegal(o)}</td>
                        <td>{isCash(o)
                          ? <span className="a-cash" title="Наличные">{cashLabel(o)}</span>
                          : <span className="a-muted">Безнал</span>}</td>
                        <td className="a-muted">{o.district ? (o.district_alias || o.district) : '—'}</td>
                        <td className="a-muted" title={o.driver_name || ''}>{o.driver_name || '—'}</td>
                        <td><span className={`a-badge a-badge--${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0]}</span></td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {o.status !== 'done' && o.status !== 'closed' && (
                            <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => onArchive(e, o)} title="Убрать в архив (останется в Журнале)">В архив</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        </div>
      )}

      {detail && (
        <OrderModal
          order={detail} types={types}
          onClose={() => setDetail(null)}
          onChanged={() => { refresh(); setDetail(null) }}
        />
      )}

      {creating && (
        <CreateOrderModal
          onClose={() => setCreating(false)}
          onCreated={() => { refresh(); setCreating(false) }}
        />
      )}
    </div>
  )
}
