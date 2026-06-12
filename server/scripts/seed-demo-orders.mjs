// Разовый сидер РАЗНООБРАЗНЫХ заявок для ручного поиска багов.
// Запуск ВНУТРИ контейнера: docker exec -i dispatcher-api node --input-type=module < этот файл
// Идёт через сервисы createOrder/assign — номера, позиции, участки, под-задачи корректны.
const { db } = await import('./src/db.js')
const { createOrder, assign } = await import('./src/services/orders.js')

const objs = await db('objects').select('id', 'client_id')
const secs = await db('sections').select('id', 'object_id', 'name')
const byObj = {}
for (const s of secs) (byObj[s.object_id] ||= []).push(s)
const W = objs.filter((o) => (byObj[o.id] || []).length >= 2) // объекты с ≥2 участками
const N = objs.filter((o) => !(byObj[o.id] || []).length)       // объекты без участков
const w = (i) => W[i % W.length]
const n = (i) => N[i % N.length]

const today = '2026-06-12', tom = '2026-06-13', d2 = '2026-06-14', yest = '2026-06-11'

const recipes = [
  { o: n(0), items: [{ action: 'haul', quantity: 1 }], date: today, time: null, pay: 'cash', amount: 3500, note: 'Забрать 1 контейнер — как можно быстрее' },
  { o: n(1), items: [{ action: 'place', quantity: 2, waste_class: '4' }], date: tom, time: '09:00', pay: 'cashless', note: 'Поставить 2 пустых (класс 4)' },
  { o: w(0), items: [{ action: 'replace', quantity: 1, section: 0 }], date: today, time: '14:00', note: 'Замена на одном участке' },
  { o: w(1), items: [{ action: 'haul', quantity: 1, section: 0 }, { action: 'replace', quantity: 1, section: 1 }], date: tom, time: '10:30', note: 'Два участка одного объекта', assignTo: 3 },
  { o: n(2), items: [{ action: 'haul', quantity: 5 }], date: d2, time: null, note: 'Большой объём → несколько рейсов' },
  { o: n(0), items: [{ action: 'place', quantity: 1 }], date: null, time: null, note: 'Без даты заезда' },
  { o: n(1), items: [{ action: 'haul', quantity: 1 }], date: yest, time: '08:00', note: 'Просроченная (вчера)' },
  { o: w(0), items: [{ action: 'haul', quantity: 2 }], date: today, time: '11:30', pay: 'cash', amount: 5200, note: 'Наличные, 2 контейнера', assignTo: 5 },
  { o: w(2), items: 'top3', date: d2, time: '13:00', note: 'Три участка сразу' },
  { o: n(2), items: [{ action: 'replace', quantity: 3, waste_class: '5' }], date: tom, time: '16:00', note: 'Класс 5, замена 3' },
  { o: w(1), items: [{ action: 'haul', quantity: 1 }], date: today, time: '12:00', note: 'Назначена водителю', assignTo: 7 },
  { o: n(0), items: [{ action: 'place', quantity: 2 }], date: tom, time: '15:00', note: 'Назначена водителю (2)', assignTo: 9 },
]

const out = []
for (const r of recipes) {
  if (!r.o) { out.push('— пропуск: нет подходящего объекта'); continue }
  const objSecs = byObj[r.o.id] || []
  let items = r.items
  if (items === 'top3') items = objSecs.slice(0, 3).map((s) => ({ action: 'replace', quantity: 1, section_id: s.id }))
  else items = items.map((it) => ({ action: it.action, quantity: it.quantity, waste_class: it.waste_class, section_id: it.section != null ? objSecs[it.section]?.id ?? null : null }))

  const payload = { object_id: r.o.id, items }
  if (r.date) payload.desired_date = r.date
  if (r.time) payload.desired_time = r.time
  if (r.pay) payload.payment_method = r.pay
  if (r.amount != null) payload.amount = r.amount
  if (r.note) payload.note = r.note

  try {
    const ord = await createOrder(payload)
    let tail = `#${ord.number} [${ord.status}] obj ${r.o.id} — ${r.note}`
    if (r.assignTo) {
      try {
        await assign(ord.id, { driver_id: r.assignTo, shift_date: r.date || today, shift_type: 'day', vehicle_id: null })
        tail += ` → назначена водителю ${r.assignTo}`
      } catch (e) { tail += ` (assign не удался: ${e.message})` }
    }
    out.push('✓ ' + tail)
  } catch (e) {
    out.push('✗ ошибка: ' + e.message + ' — ' + r.note)
  }
}

console.log(out.join('\n'))
console.log('\nИТОГО создано:', out.filter((x) => x.startsWith('✓')).length, 'из', recipes.length)
process.exit(0)
