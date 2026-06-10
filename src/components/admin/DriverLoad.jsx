import { driverLoad } from '@/lib/orderUi'

// Компактный индикатор загрузки водителя: условный км до базы + интегральный балл.
// Балл = заезды + вес·км (то же, что в алгоритме распределения) — единая мера «тяжести».
export function DriverLoad({ orders }) {
  const l = driverLoad(orders)
  if (!l.count) return null
  return (
    <div className="a-driverload" title="Условный километраж до базы · интегральный балл загрузки (заезды + вес·км)">
      <span className="a-driverload-km">📏 {l.km} км</span>
      <span className="a-driverload-score" title="Интегральный балл загрузки">⚖ {l.score}</span>
      {l.kmMissing > 0 && (
        <span className="a-driverload-warn" title={`${l.kmMissing} заявок без координат — км не учтён`}>⚠{l.kmMissing}</span>
      )}
    </div>
  )
}
