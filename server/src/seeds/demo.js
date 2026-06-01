// Разовый демо-сид для теста UI: машины, водители, клиенты+объекты, заявки.
// Запуск:  node src/seeds/demo.js
import { db } from '../db.js'
import { createObject } from '../services/objects.js'
import { createOrder } from '../services/orders.js'

const rnd = (a) => a[Math.floor(Math.random() * a.length)]
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const chance = (p) => Math.random() < p

const LAST = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Павлов', 'Семёнов', 'Голубев']
const FIRST = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Михаил', 'Иван', 'Николай', 'Владимир', 'Павел', 'Роман']
const CLIENTS = [
  ['ООО «Маршалл»', 'Маршалл'], ['ООО «СтройГрад»', 'Стройград'], ['ИП Кузьмин В.А.', 'Кузьмин кафе'],
  ['ООО «ЮгТорг»', 'ЮгТорг'], ['ООО «ГринСервис»', 'ГринСервис'], ['ИП Орлова Е.С.', 'Пекарня у моста'],
]
const SPOTS = ['Главный вход', 'Задний двор', 'Кафе', 'Магазин', 'Стройплощадка', 'Парковка']

async function main() {
  let type = await db('container_types').first()
  if (!type) [type] = await db('container_types').insert({ name: 'Лодочка', volume: 8 }).returning('*')

  // машины
  const vehicles = []
  for (let i = 0; i < 5; i++) {
    const gov = `${rnd('АВЕКМНОРСТУХ')}${rint(100, 999)}${rnd('АВЕКМНОРСТУХ')}${rnd('АВЕКМНОРСТУХ')}123`
    const [v] = await db('vehicles').insert({
      gov_number: gov, model: rnd(['КамАЗ 6520', 'МАЗ 5550', 'ГАЗон Next', 'Isuzu Forward']),
      capacity_slots: 3, fuel_norm: rint(28, 38), status: chance(0.85) ? 'active' : rnd(['repair', 'broken']),
    }).returning('*')
    vehicles.push(v)
  }

  // 10 водителей
  for (let i = 0; i < 10; i++) {
    await db('drivers').insert({
      name: `${rnd(LAST)} ${rnd(FIRST)}`,
      phone: `+7918${rint(1000000, 9999999)}`,
      is_active: chance(0.85),
      default_vehicle_id: rnd(vehicles).id,
    })
  }

  // случайные улицы для объектов
  const streets = await db('streets').orderByRaw('random()').limit(40)

  // клиенты + объекты
  const objects = []
  for (const [legal, nick] of CLIENTS) {
    const [c] = await db('clients').insert({
      type: legal.startsWith('ИП') ? 'ip' : 'ooo',
      legal_name: legal, nickname: nick,
      inn: String(rint(1000000000, 9999999999)),
      phone: `+7861${rint(1000000, 9999999)}`,
      default_payment_method: rnd(['cashless', 'cash']),
      requires_photo: chance(0.4),
    }).returning('*')
    for (let j = 0; j < rint(2, 4); j++) {
      const st = rnd(streets)
      const o = await createObject({
        client_id: c.id, street_id: st.id, house: String(rint(1, 120)),
        informal_name: chance(0.5) ? `${nick} · ${rnd(SPOTS)}` : undefined,
      })
      objects.push(o)
    }
  }

  // 20 заявок
  const actions = ['place', 'replace', 'haul']
  for (let i = 0; i < 20; i++) {
    const obj = rnd(objects)
    const items = Array.from({ length: rint(1, 2) }, () => ({
      action: rnd(actions), container_type_id: type.id, quantity: rint(1, 3),
      ...(chance(0.5) ? { waste_class: rnd(['4', '5']) } : {}),
    }))
    await createOrder({
      object_id: obj.id, items,
      ...(chance(0.6) ? { desired_date: new Date(Date.now() + rint(0, 5) * 864e5).toISOString().slice(0, 10) } : {}),
      ...(chance(0.3) ? { note: rnd(['Позвонить за час', 'Код от ворот 1234', 'Только до 16:00', 'Спросить охрану']) } : {}),
    })
  }

  const counts = {
    vehicles: (await db('vehicles').count())[0].count,
    drivers: (await db('drivers').count())[0].count,
    clients: (await db('clients').count())[0].count,
    objects: (await db('objects').count())[0].count,
    orders: (await db('orders').count())[0].count,
  }
  console.log('Демо-данные засеяны:', counts)
  await db.destroy()
}

main().catch((e) => { console.error(e); process.exit(1) })
