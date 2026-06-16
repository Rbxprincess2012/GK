import { describe, it, expect } from 'vitest'
import { haversineKm, tripsFor, tripsForItems, tripsFromCounts, suggest } from '../src/lib/distribute.js'

describe('haversineKm', () => {
  it('нулевое расстояние для одной точки', () => {
    expect(haversineKm({ lat: 45, lng: 39 }, { lat: 45, lng: 39 })).toBe(0)
  })
  it('null при отсутствии координат', () => {
    expect(haversineKm({ lat: null, lng: null }, { lat: 45, lng: 39 })).toBeNull()
  })
  it('~111 км на 1° широты', () => {
    const d = haversineKm({ lat: 45, lng: 39 }, { lat: 46, lng: 39 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('tripsFor', () => {
  it('1 заезд если влезает', () => expect(tripsFor(3, 3)).toBe(1))
  it('2 заезда если больше вместимости', () => expect(tripsFor(4, 3)).toBe(2))
  it('минимум 1', () => expect(tripsFor(0, 3)).toBe(1))
})

describe('tripsForItems (правила машины: ≤2 пустых туда / ≤1 полный обратно)', () => {
  const p = (q) => ({ action: 'place', quantity: q })
  const r = (q) => ({ action: 'replace', quantity: q })
  const h = (q) => ({ action: 'haul', quantity: q })

  it('Поставить 2 → 1 заезд (2 пустых вставлены друг в друга)', () => expect(tripsForItems([p(2)])).toBe(1))
  it('Поставить 1 → 1 заезд', () => expect(tripsForItems([p(1)])).toBe(1))
  it('Поставить 3 → 2 заезда', () => expect(tripsForItems([p(3)])).toBe(2))
  it('Заменить 2 → 2 заезда (2 пустых туда, по 1 полному обратно)', () => expect(tripsForItems([r(2)])).toBe(2))
  it('Заменить 1 → 1 заезд', () => expect(tripsForItems([r(1)])).toBe(1))
  it('Забрать 2 → 2 заезда (полные не вставляются, по одному)', () => expect(tripsForItems([h(2)])).toBe(2))
  it('Поставить 1 + Забрать 1 на объекте → 1 заезд (1 пустой туда, 1 полный обратно)', () =>
    expect(tripsForItems([p(1), h(1)])).toBe(1))
  it('пусто → 1', () => expect(tripsForItems([])).toBe(1))
  it('tripsFromCounts(0,0) → 1', () => expect(tripsFromCounts(0, 0)).toBe(1))

  // Вместимость пустых задаётся в машине (emptyCap).
  it('Поставить 3, машина возит 3 пустых → 1 заезд', () => expect(tripsForItems([p(3)], 3)).toBe(1))
  it('Поставить 3, машина возит 2 пустых → 2 заезда', () => expect(tripsForItems([p(3)], 2)).toBe(2))
  it('Поставить 4, машина возит 4 пустых → 1 заезд', () => expect(tripsForItems([p(4)], 4)).toBe(1))
  it('Заменить 3, машина возит 3 пустых → 3 заезда (полные по одному)', () => expect(tripsForItems([r(3)], 3)).toBe(3))
})

const drivers3 = [
  { id: 1, name: 'A', capacity: 3 },
  { id: 2, name: 'B', capacity: 3 },
]

describe('suggest', () => {
  it('без водителей — всё в unassigned', () => {
    const r = suggest({ orders: [{ id: 1, slots: 1, km: 5, district: 'X' }], drivers: [] })
    expect(r.assignments).toEqual([])
    expect(r.unassigned).toEqual([1])
  })

  it('делит поровну по числу при равных расстояниях', () => {
    const orders = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, slots: 1, km: 0, district: 'X' }))
    const r = suggest({ orders, drivers: drivers3 })
    const counts = r.assignments.map((a) => a.order_ids.length).sort()
    expect(counts).toEqual([3, 3])
  })

  it('балансирует километраж: далёкие не валятся на одного', () => {
    // 2 далёких и 2 близких — справедливо: каждому по одному далёкому и одному близкому.
    const orders = [
      { id: 1, slots: 1, km: 100, district: 'Far' },
      { id: 2, slots: 1, km: 100, district: 'Far' },
      { id: 3, slots: 1, km: 1, district: 'Near' },
      { id: 4, slots: 1, km: 1, district: 'Near' },
    ]
    const r = suggest({ orders, drivers: drivers3, kmWeight: 0.1 })
    // у каждого водителя должно быть примерно по 101 баллу
    const scores = r.assignments.map((a) => a.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(1)
    // и километраж примерно равный
    const kms = r.assignments.map((a) => a.km)
    expect(Math.max(...kms) - Math.min(...kms)).toBeLessThan(50)
  })

  it('равномерно при избытке водителей (6 заявок, 10 водителей → разброс ≤ 1)', () => {
    const orders = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, slots: 1, km: 0, district: ['A', 'B'][i % 2] }))
    const drivers = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `D${i + 1}`, capacity: 3 }))
    const r = suggest({ orders, drivers })
    const counts = r.assignments.map((a) => a.order_ids.length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    expect(counts.filter((c) => c === 1).length).toBe(6)
  })

  it('intrinsic trips: учитывает order.trips вместо слотов/вместимости', () => {
    // Две заявки: одна «тяжёлая» (2 заезда), одна лёгкая (1) — раскидываются по разным водителям.
    const orders = [
      { id: 1, trips: 2, km: 0, district: 'A' },
      { id: 2, trips: 1, km: 0, district: 'A' },
      { id: 3, trips: 1, km: 0, district: 'A' },
    ]
    const r = suggest({ orders, drivers: drivers3 })
    const tripsByDriver = r.assignments.map((a) => a.trips).sort()
    // 4 заезда всего на 2 водителей → 2 и 2 (тяжёлая одному, две лёгкие другому).
    expect(tripsByDriver).toEqual([2, 2])
  })

  it('заезды по вместимости пустых машины: заявка уходит туда, где меньше рейсов', () => {
    // Поставить 4 пустых. Водитель A возит 2 за рейс → 2 заезда; B возит 4 → 1 заезд.
    const orders = [{ id: 1, empties: 4, fulls: 0, km: 0, district: 'A' }]
    const drivers = [
      { id: 1, name: 'A', empty_capacity: 2 },
      { id: 2, name: 'B', empty_capacity: 4 },
    ]
    const r = suggest({ orders, drivers })
    const b = r.assignments.find((a) => a.driver_id === 2)
    expect(b.order_ids).toEqual([1])
    expect(b.trips).toBe(1)
  })

  it('детерминирован: одинаковый вход → одинаковый выход', () => {
    const orders = [
      { id: 1, slots: 2, km: 30, district: 'A' },
      { id: 2, slots: 1, km: 5, district: 'B' },
      { id: 3, slots: 3, km: 12, district: 'A' },
      { id: 4, slots: 1, km: 40, district: 'C' },
      { id: 5, slots: 1, km: 8, district: 'B' },
    ]
    const r1 = suggest({ orders, drivers: drivers3 })
    const r2 = suggest({ orders, drivers: drivers3 })
    expect(r1).toEqual(r2)
  })

  it('priorScores: перегруженный за период получает меньше сегодня', () => {
    // Две одинаковые заявки; у водителя 1 высокий накопленный балл → обе уходят водителю 2.
    const orders = [
      { id: 1, trips: 1, km: 0, district: 'X' },
      { id: 2, trips: 1, km: 0, district: 'X' },
    ]
    const r = suggest({ orders, drivers: drivers3, priorScores: { 1: 10 } })
    const a = r.assignments.find((x) => x.driver_id === 1)
    const b = r.assignments.find((x) => x.driver_id === 2)
    expect(a.order_ids.length).toBe(0)
    expect(b.order_ids.length).toBe(2)
  })

  it('localityWeight: заявки группируются по близости координат (кучность важнее дневного баланса)', () => {
    // Две тесные гео-зоны, далеко друг от друга: {1,2} ~1 км и {3,4} ~1 км, между зонами ~20+ км.
    const orders = [
      { id: 1, trips: 1, km: 0, lat: 45.10, lng: 39.00 },
      { id: 2, trips: 1, km: 0, lat: 45.11, lng: 39.00 },
      { id: 3, trips: 1, km: 0, lat: 45.00, lng: 39.30 },
      { id: 4, trips: 1, km: 0, lat: 45.01, lng: 39.30 },
    ]
    const r = suggest({ orders, drivers: drivers3, localityWeight: 5, clusterKm: 2 })
    const groupOf = (id) => r.assignments.findIndex((a) => a.order_ids.includes(id))
    expect(groupOf(1)).toBe(groupOf(2))      // близкие — к одному водителю
    expect(groupOf(3)).toBe(groupOf(4))
    expect(groupOf(1)).not.toBe(groupOf(3))  // далёкие зоны — к разным
  })

  it('кучность без координат не действует — заявки всё равно распределяются (любой город)', () => {
    const orders = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, trips: 1, km: 0 })) // нет lat/lng
    const r = suggest({ orders, drivers: drivers3, localityWeight: 5, clusterKm: 2 })
    const counts = r.assignments.map((a) => a.order_ids.length).sort()
    expect(counts).toEqual([3, 3])           // чистый баланс (2 водителя), без падений
    expect(r.unassigned).toEqual([])
  })

  it('сегрегация: грейфер-заявка идёт только водителю-грейферу, контейнерная — контейнеровозу', () => {
    const orders = [
      { id: 1, trips: 1, km: 0, district: 'X', service: 'grapple' },
      { id: 2, trips: 1, km: 0, district: 'X', service: 'container' },
    ]
    const drivers = [
      { id: 1, name: 'Контейнеровоз', kind: 'container' },
      { id: 2, name: 'Грейфер', kind: 'grapple' },
    ]
    const r = suggest({ orders, drivers })
    const cont = r.assignments.find((a) => a.driver_id === 1)
    const grap = r.assignments.find((a) => a.driver_id === 2)
    expect(cont.order_ids).toEqual([2])
    expect(grap.order_ids).toEqual([1])
    expect(r.unassigned).toEqual([])
  })

  it('сегрегация: грейфер-заявка без водителя-грейфера → в unassigned', () => {
    const orders = [{ id: 1, trips: 1, km: 0, district: 'X', service: 'grapple' }]
    const drivers = [{ id: 1, name: 'Контейнеровоз', kind: 'container' }]
    const r = suggest({ orders, drivers })
    expect(r.unassigned).toEqual([1])
    expect(r.assignments.every((a) => a.order_ids.length === 0)).toBe(true)
  })

  it('сегрегация: несколько грейфер-заявок делятся между грейфер-водителями, не уходят контейнеровозам', () => {
    const orders = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, trips: 1, km: 0, district: 'X', service: 'grapple' }))
    const drivers = [
      { id: 1, name: 'К', kind: 'container' },
      { id: 2, name: 'Г1', kind: 'grapple' },
      { id: 3, name: 'Г2', kind: 'grapple' },
    ]
    const r = suggest({ orders, drivers })
    const cont = r.assignments.find((a) => a.driver_id === 1)
    expect(cont.order_ids).toEqual([]) // контейнеровозу грейфер не достаётся
    const grapTotal = r.assignments.filter((a) => a.driver_id !== 1).flatMap((a) => a.order_ids).sort()
    expect(grapTotal).toEqual([1, 2, 3, 4])
    expect(r.unassigned).toEqual([])
  })

  it('дефолт без типов сохраняет прежнее поведение (всё container)', () => {
    const orders = [{ id: 1, trips: 1, km: 0, district: 'X' }]
    const r = suggest({ orders, drivers: drivers3 })
    expect(r.unassigned).toEqual([])
    expect(r.assignments.flatMap((a) => a.order_ids)).toEqual([1])
  })

  it('все заявки распределены, ничего не потеряно и не задвоено', () => {
    const orders = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, slots: (i % 3) + 1, km: (i * 7) % 50, district: ['A', 'B', 'C'][i % 3],
    }))
    const r = suggest({ orders, drivers: [...drivers3, { id: 3, name: 'C', capacity: 3 }] })
    const all = r.assignments.flatMap((a) => a.order_ids).sort((a, b) => a - b)
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
