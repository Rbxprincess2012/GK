// Докинуть N случайных заявок (status=new) на существующие объекты — для теста UI.
// Запуск:  node src/seeds/random-orders.js [N]   (по умолчанию 10)
import { db } from '../db.js'
import { createOrder } from '../services/orders.js'

const rnd = (a) => a[Math.floor(Math.random() * a.length)]
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const chance = (p) => Math.random() < p

const N = Number(process.argv[2]) || 10

async function main() {
  const objects = await db('objects').select('id')
  if (!objects.length) throw new Error('Нет объектов — сначала запусти demo-сид (node src/seeds/demo.js)')
  const types = await db('container_types').select('id')
  if (!types.length) throw new Error('Нет типов контейнеров')

  const actions = ['place', 'replace', 'haul']
  for (let i = 0; i < N; i++) {
    const obj = rnd(objects)
    const items = Array.from({ length: rint(1, 3) }, () => ({
      action: rnd(actions), container_type_id: rnd(types).id, quantity: rint(1, 3),
      ...(chance(0.5) ? { waste_class: rnd(['4', '5']) } : {}),
    }))
    const o = await createOrder({
      object_id: obj.id, items,
      ...(chance(0.6) ? { desired_date: new Date(Date.now() + rint(0, 5) * 864e5).toISOString().slice(0, 10) } : {}),
      ...(chance(0.3) ? { note: rnd(['Позвонить за час', 'Код от ворот 1234', 'Только до 16:00', 'Спросить охрану']) } : {}),
    })
    console.log(`#${o.number} → объект ${obj.id}, позиций ${items.length}`)
  }
  console.log(`Создано заявок: ${N}`)
  await db.destroy()
}

main().catch((e) => { console.error(e); process.exit(1) })
