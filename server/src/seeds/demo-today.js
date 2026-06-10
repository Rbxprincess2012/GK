// Демо-сид: 2 заявки на СЕГОДНЯ, назначенные первому активному водителю.
// Запуск: node src/seeds/demo-today.js
import { db } from '../db.js'
import { createOrder, assign } from '../services/orders.js'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function main() {
  const today = ymd(new Date())

  // водитель (первый активный) + машина + смена present на сегодня
  let drv = await db('drivers').where({ is_active: true }).orderBy('id').first()
  if (!drv) [drv] = await db('drivers').insert({ name: 'Тест Водитель', is_active: true }).returning('*')

  let veh = drv.default_vehicle_id ? await db('vehicles').where({ id: drv.default_vehicle_id }).first() : null
  if (!veh) {
    [veh] = await db('vehicles').insert({ gov_number: 'Т001ЕС', empty_capacity: 2, mileage: 1000 }).returning('*')
    await db('drivers').where({ id: drv.id }).update({ default_vehicle_id: veh.id })
  }
  await db('shifts').insert({ driver_id: drv.id, date: today, shift_type: 'day', status: 'present', vehicle_id: veh.id })
    .onConflict(['driver_id', 'date', 'shift_type']).merge()

  // город + улицы (для адреса «город, улица, дом» в карточке водителя)
  const [dist] = await db('districts').insert({ name: 'Краснодар', kind: 'city' })
    .onConflict('name').merge().returning('*')
  const mkStreet = async (name) => {
    const ex = await db('streets').where({ name, district_id: dist.id }).first()
    if (ex) return ex
    const [s] = await db('streets').insert({ name, district_id: dist.id }).returning('*')
    return s
  }
  const stMorskaya = await mkStreet('Морская')
  const stSevernaya = await mkStreet('Северная')

  // клиент + 2 объекта (с координатами Краснодара для ссылки на карту) + участки
  const [cl] = await db('clients').insert({
    type: 'ooo', legal_name: 'ООО «Ромашка»', nickname: 'Ромашка', default_payment_method: 'cashless',
  }).returning('*')
  const [ob1] = await db('objects').insert({
    client_id: cl.id, city: 'Краснодар', district_id: dist.id, street_id: stMorskaya.id, house: '12', building: '2',
    address_raw: 'Краснодар, ул. Морская, д. 12, к. 2', informal_name: 'Склад на Морской', lat: 45.0355, lng: 38.9753,
  }).returning('*')
  const [ob2] = await db('objects').insert({
    client_id: cl.id, city: 'Краснодар', district_id: dist.id, street_id: stSevernaya.id, house: '5',
    address_raw: 'Краснодар, ул. Северная, д. 5', informal_name: 'Площадка Север', lat: 45.0410, lng: 38.9600,
  }).returning('*')
  const [s58] = await db('sections').insert({ object_id: ob1.id, name: '58' }).returning('*')
  const [s63] = await db('sections').insert({ object_id: ob1.id, name: '63' }).returning('*')

  // заявка 1: заменить по 1 на участках 58 и 63 (двухуровневое сообщение + 2 пустых с базы)
  const o1 = await createOrder({
    object_id: ob1.id, desired_date: today,
    items: [{ action: 'replace', quantity: 1, section_id: s58.id }, { action: 'replace', quantity: 1, section_id: s63.id }],
  })
  // заявка 2: поставить 2 (без участков)
  const o2 = await createOrder({ object_id: ob2.id, desired_date: today, items: [{ action: 'place', quantity: 2 }] })

  await assign(o1.id, { driver_id: drv.id, shift_date: today, shift_type: 'day', vehicle_id: veh.id })
  await assign(o2.id, { driver_id: drv.id, shift_date: today, shift_type: 'day', vehicle_id: veh.id })

  console.log(`Водитель: ${drv.name} (id ${drv.id})`)
  console.log(`Заявка №${o1.number}: «${ob1.informal_name}» — участки 58/63 (заменить по 1)`)
  console.log(`Заявка №${o2.number}: «${ob2.informal_name}» — поставить 2`)
  console.log(`Дата: ${today}`)
  await db.destroy()
}

main().catch((e) => { console.error('seed error:', e.message); process.exit(1) })
