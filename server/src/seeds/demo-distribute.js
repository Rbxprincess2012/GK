// Демо-сид: 6 НЕраспределённых заявок (status=new) на сегодня — для страницы «Распределение».
// Объекты с разным числом участков; заявки затрагивают разное число участков.
// Запуск: node src/seeds/demo-distribute.js
import { db } from '../db.js'
import { createOrder } from '../services/orders.js'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function main() {
  const today = ymd(new Date())

  const [dist] = await db('districts').insert({ name: 'Краснодар', kind: 'city' })
    .onConflict('name').merge().returning('*')
  const mkStreet = async (name) => {
    const ex = await db('streets').where({ name, district_id: dist.id }).first()
    if (ex) return ex
    const [s] = await db('streets').insert({ name, district_id: dist.id }).returning('*')
    return s
  }

  const [cl] = await db('clients').insert({
    type: 'ooo', legal_name: 'ООО «Вектор»', nickname: 'Вектор', default_payment_method: 'cashless',
  }).returning('*')

  // Объект с заданным числом участков. sections — массив имён.
  const mkObject = async ({ name, street, house, lat, lng, sections = [] }) => {
    const st = await mkStreet(street)
    const [ob] = await db('objects').insert({
      client_id: cl.id, city: 'Краснодар', district_id: dist.id, street_id: st.id, house,
      address_raw: `Краснодар, ул. ${street}, д. ${house}`, informal_name: name, lat, lng,
    }).returning('*')
    const secs = []
    for (const sName of sections) {
      const [s] = await db('sections').insert({ object_id: ob.id, name: sName }).returning('*')
      secs.push(s)
    }
    return { ob, secs }
  }

  // Объекты с разным числом участков
  const market = await mkObject({ name: 'Рынок Центральный', street: 'Базарная', house: '1', lat: 45.0210, lng: 38.9750, sections: [] })
  const galery = await mkObject({ name: 'ТЦ Галерея', street: 'Красная', house: '176', lat: 45.0448, lng: 38.9760, sections: ['А', 'Б'] })
  const zavod = await mkObject({ name: 'Завод Прогресс', street: 'Заводская', house: '20', lat: 45.0600, lng: 39.0100, sections: ['Цех-1', 'Цех-2', 'Цех-3'] })
  const park = await mkObject({ name: 'Парк Северный', street: 'Тополиная', house: '8', lat: 45.0700, lng: 38.9500, sections: ['С1', 'С2', 'С3', 'С4'] })
  const sklad = await mkObject({ name: 'Склад Восток', street: 'Складская', house: '5', lat: 45.0150, lng: 39.0300, sections: ['12', '15', '18', '21', '24'] })

  const S = (o, name) => o.secs.find((x) => x.name === name).id
  const made = []
  const add = async (label, object_id, items) => {
    const o = await createOrder({ object_id, desired_date: today, items })
    made.push(`№${o.number} · ${label}`)
  }

  // 1) 0 участков — на весь объект
  await add('Рынок Центральный — поставить 2 (весь объект)', market.ob.id,
    [{ action: 'place', quantity: 2 }])
  // 2) 2 участка
  await add('ТЦ Галерея — заменить на участках А и Б', galery.ob.id,
    [{ action: 'replace', quantity: 1, section_id: S(galery, 'А') }, { action: 'replace', quantity: 1, section_id: S(galery, 'Б') }])
  // 3) 3 участка
  await add('Завод Прогресс — заменить на 3 цехах', zavod.ob.id,
    [{ action: 'replace', quantity: 1, section_id: S(zavod, 'Цех-1') },
     { action: 'replace', quantity: 1, section_id: S(zavod, 'Цех-2') },
     { action: 'replace', quantity: 1, section_id: S(zavod, 'Цех-3') }])
  // 4) 2 из 4 участков, смешанные действия
  await add('Парк Северный — поставить на С1, заменить на С3', park.ob.id,
    [{ action: 'place', quantity: 1, section_id: S(park, 'С1') }, { action: 'replace', quantity: 1, section_id: S(park, 'С3') }])
  // 5) 1 участок — забрать
  await add('Завод Прогресс — забрать на Цех-2', zavod.ob.id,
    [{ action: 'haul', quantity: 2, section_id: S(zavod, 'Цех-2') }])
  // 6) 3 из 5 участков
  await add('Склад Восток — заменить на 12, 18, 24', sklad.ob.id,
    [{ action: 'replace', quantity: 1, section_id: S(sklad, '12') },
     { action: 'replace', quantity: 1, section_id: S(sklad, '18') },
     { action: 'replace', quantity: 1, section_id: S(sklad, '24') }])

  console.log(`Создано ${made.length} нераспределённых заявок (status=new) на ${today}:`)
  for (const m of made) console.log('  ' + m)
  await db.destroy()
}

main().catch((e) => { console.error('seed error:', e.message); process.exit(1) })
