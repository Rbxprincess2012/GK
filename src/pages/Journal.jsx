import { useEffect, useCallback } from 'react'
import { Eye, Link2 } from 'lucide-react'
import { useOrdersStore } from '@/store/ordersStore'
import { useToast } from '@/components/admin/Toast'
import { STATUS, clientLegal, streetLine, objectLine } from '@/lib/orderUi'

// Публичная страница отчёта (как видит клиент): {origin}/r/<public_token>.
const reportHref = (o) => `${window.location.origin}/r/${o.public_token}`

// Журнал — неизменяемый список ВСЕХ заявок клиентов (любой статус).
// Удалять записи нельзя; отменённую можно вернуть во «Входящие».
export default function Journal() {
  const { orders, fetchOrders, restoreOrder } = useOrdersStore()
  const toast = useToast()
  const refresh = useCallback(() => fetchOrders({}), [fetchOrders])
  useEffect(() => { refresh() }, [refresh])

  const onRestore = async (o) => {
    try { await restoreOrder(o.id); toast.success(`${o.number ? '#' + o.number : 'Заявка'} возвращена во Входящие`) }
    catch { toast.error('Не удалось вернуть') }
  }

  const copyReport = (o) => navigator.clipboard.writeText(reportHref(o))
    .then(() => toast.success('Ссылка на отчёт скопирована'))
    .catch(() => toast.error('Не удалось скопировать'))

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Журнал <span className="a-count">{orders.length}</span></h2>
        <span className="a-muted" style={{ fontSize: '0.8rem' }}>Все заявки клиентов · записи не удаляются</span>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>№</th><th>Улица</th><th>Объект</th><th>Заказчик</th><th>Дата заезда</th><th>Водитель</th><th>Статус</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 700 }}>{o.number ? `#${o.number}` : <span className="a-muted" style={{ fontWeight: 400 }}>черновик</span>}</td>
                <td style={{ fontWeight: 600 }}>{streetLine(o)}</td>
                <td className="a-muted">{objectLine(o)}</td>
                <td className="a-muted">{clientLegal(o)}</td>
                <td className="a-muted">{o.desired_date?.slice(0, 10) || '—'}{o.desired_time ? ` ${o.desired_time.slice(0, 5)}` : ''}</td>
                <td className="a-muted">{o.driver_name || '—'}</td>
                <td><span className={`a-badge a-badge--${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0] || o.status}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {o.public_token && (
                      <>
                        <a className="a-btn a-btn--ghost a-btn--sm" href={reportHref(o)} target="_blank" rel="noreferrer" title="Открыть отчёт — как видит клиент"><Eye size={14} /></a>
                        <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => copyReport(o)} title="Копировать ссылку на отчёт"><Link2 size={14} /></button>
                      </>
                    )}
                    {o.status === 'cancelled' && (
                      <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => onRestore(o)}>Вернуть во Входящие</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="a-loading">Пусто</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
