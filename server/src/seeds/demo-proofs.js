// Демо-сид для проверки пруфов: одна заявка in_progress с 3 участками —
// 2 выполнены с фото-пруфами (picsum), 1 не выполнен. Появляется в «Проверке пруфов».
// После приёмки менеджером генерится публичный отчёт /r/:token. Запуск: node src/seeds/demo-proofs.js
import { db } from '../db.js'
import { createOrder } from '../services/orders.js'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function main() {
  const today = ymd(new Date())

  const [dist] = await db('districts').insert({ name: 'Краснодар', kind: 'city' })
    .onConflict('name').merge().returning('*')
  let st = await db('streets').where({ name: 'Северная', district_id: dist.id }).first()
  if (!st) [st] = await db('streets').insert({ name: 'Северная', district_id: dist.id }).returning('*')

  const [cl] = await db('clients').insert({
    type: 'ooo', legal_name: 'ООО «Ромашка»', nickname: 'Ромашка', default_payment_method: 'cash',
  }).returning('*')
  const [ob] = await db('objects').insert({
    client_id: cl.id, city: 'Краснодар', district_id: dist.id, street_id: st.id, house: '12',
    address_raw: 'Краснодар, ул. Северная, д. 12', informal_name: 'Бизнес-центр Ромашка', lat: 45.045, lng: 38.976,
  }).returning('*')
  const secNames = ['Склад', 'Цех', 'Двор']
  const secs = []
  for (const name of secNames) {
    const [s] = await db('sections').insert({ object_id: ob.id, name }).returning('*')
    secs.push(s)
  }
  const [veh] = await db('vehicles').insert({ model: 'Volvo FM', gov_number: 'Х123ХХ123' }).returning('*')
  const [drv] = await db('drivers').insert({ name: 'Кузнецов А.', default_vehicle_id: veh.id }).returning('*')

  // Заявка на 3 участка, желаемое время 13:00, оплата наличными.
  const order = await createOrder({
    object_id: ob.id, desired_date: today, desired_time: '13:00',
    payment_method: 'cash', amount: 8500,
    items: secs.map((s) => ({ action: 'replace', quantity: 1, section_id: s.id })),
  })
  // Перевести в работу на сегодня к водителю.
  await db('orders').where({ id: order.id }).update({
    status: 'in_progress', assigned_driver_id: drv.id, vehicle_id: veh.id, shift_date: today, shift_type: 'day',
  })

  // Исходы по участкам: Склад/Цех — done с фото; Двор — failed.
  const subs = await db('order_subtasks').where({ order_id: order.id }).orderBy('sub_no')
  let seed = 1
  for (const sub of subs) {
    const sec = secs.find((s) => s.id === sub.section_id)
    if (sec && sec.name === 'Двор') {
      await db('order_subtasks').where({ id: sub.id })
        .update({ status: 'failed', reason_code: 'no_access', comment: 'Ворота закрыты, охраны нет', completed_by_driver_id: drv.id, completed_at: db.fn.now() })
    } else {
      await db('order_subtasks').where({ id: sub.id })
        .update({ status: 'done', completed_by_driver_id: drv.id, completed_at: db.fn.now() })
      for (let k = 0; k < 2; k++) {
        await db('attachments').insert({
          order_id: order.id, subtask_id: sub.id, kind: 'photo',
          file_url: `https://picsum.photos/seed/p${seed++}/600/400`, author_driver_id: drv.id,
        })
      }
    }
  }

  console.log(`Создана заявка №${order.number} (in_progress) с пруфами для проверки. Откройте «Проверка пруфов».`)
  await db.destroy()
}

main().catch((e) => { console.error('seed error:', e.message); process.exit(1) })
