// Отображение адреса объекта. Объект может быть задан через справочник улиц
// (street_name + house) ИЛИ свободным адресом из DaData (address_raw + координаты) —
// для городов вне справочника Краснодара. Везде показываем по единому правилу.

// Собираем адрес из справочника ТОЛЬКО при наличии улицы. Без street_name огрызок «д. N»
// неинформативен — там показываем полный свободный адрес из DaData (address_raw).
function composedStreet(o) {
  if (!o?.street_name) return ''
  return [o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`]
    .filter(Boolean).join(', ')
}

// Полный адрес объекта (ячейка «Адрес»).
export function objectAddress(o) {
  return composedStreet(o) || o?.address_raw || (o?.house ? `д. ${o.house}` : '—')
}

// Заголовок/метка объекта: неформальное имя → адрес → «Объект #id».
export function objectLabel(o) {
  if (o?.informal_name) return o.informal_name
  return composedStreet(o) || o?.address_raw || `Объект #${o?.id}`
}
