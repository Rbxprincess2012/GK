// Чистая логика справедливого распределения заявок между водителями.
// Без БД — только функции над данными, поэтому легко тестируется.
//
// Справедливость = минимизировать разброс «балла тяжести» между водителями:
//   score(водитель) = Σ_заявок ( trips + km_weight · km )
//   trips(заявка)   = ceil(slots / capacity_машины)   (минимум 1)
//   km(заявка)      = прямое расстояние объект→база (гаверсинус), 0 если нет координат
//
// Алгоритм C: жадный старт (далёкие первыми, с группировкой по району) + полировка
// парными переносами/обменами, уменьшающими разброс.

const R_KM = 6371 // радиус Земли, км

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}

// Число заездов по слотам и вместимости машины (старая модель; оставлено для совместимости).
export function tripsFor(slots, capacity) {
  const s = Math.max(1, Number(slots) || 1)
  const c = Math.max(1, Number(capacity) || 1)
  return Math.ceil(s / c)
}

// Число заездов по правилам машины: за рейс ≤ emptyCap пустых контейнеров ТУДА
// (вставляются друг в друга, «лего»; emptyCap задаётся в машине, по умолчанию 2)
// и ровно 1 полный контейнер ОБРАТНО (полные не вставляются). На уровне объекта:
//   E (пустых привезти) = Поставить + Заменить
//   F (полных забрать)  = Заменить + Забрать
//   ходки = max(ceil(E/emptyCap), F)   (минимум 1)
// При emptyCap=2: Поставить 2 → 1; Заменить 2 → 2; Забрать 2 → 2.
export function tripsFromCounts(empties, fulls, emptyCap = 2) {
  const E = Math.max(0, Number(empties) || 0)
  const F = Math.max(0, Number(fulls) || 0)
  const cap = Math.max(1, Number(emptyCap) || 2)
  return Math.max(Math.ceil(E / cap), F, 1)
}

export function tripsForItems(items = [], emptyCap = 2) {
  let E = 0, F = 0
  for (const it of items) {
    const q = Number(it.quantity) || 1
    if (it.action === 'place') E += q
    else if (it.action === 'replace') { E += q; F += q }
    else if (it.action === 'haul') F += q
  }
  return tripsFromCounts(E, F, emptyCap)
}

// Заездов у заявки для конкретного водителя: по пустым/полным и вместимости пустых
// машины этого водителя; иначе старый intrinsic trips / слот-вместимость.
function tripsOf(order, driver) {
  if (order.empties != null || order.fulls != null)
    return tripsFromCounts(order.empties, order.fulls, driver?.empty_capacity)
  return order.trips != null ? order.trips : tripsFor(order.slots, driver.capacity)
}

// Вклад заявки в балл тяжести конкретного водителя.
function orderCost(order, driver, kmWeight) {
  return tripsOf(order, driver) + kmWeight * (order.km || 0)
}

function scoreOf(driver, orders, byId, kmWeight) {
  let s = 0
  for (const oid of orders) s += orderCost(byId.get(oid), driver, kmWeight)
  return s
}

function spreadOf(scores) {
  const vals = Object.values(scores)
  return vals.length ? Math.max(...vals) - Math.min(...vals) : 0
}

// Основная функция. Возвращает раскладку + метрики.
export function suggest({ orders = [], drivers = [], kmWeight = 0.1, locality = 1.0, maxPolish } = {}) {
  const byId = new Map(orders.map((o) => [o.id, o]))
  if (!drivers.length) {
    return { assignments: [], unassigned: orders.map((o) => o.id), spread: 0 }
  }

  // assignment: driverId -> [orderId]
  const assign = new Map(drivers.map((d) => [d.id, []]))
  const driverById = new Map(drivers.map((d) => [d.id, d]))
  const districtsOf = (oids) => new Set(oids.map((id) => byId.get(id).district ?? null))

  // ── Фаза 1: жадно, далёкие первыми; при равенстве — к тому, кто уже везёт этот район.
  const ordered = [...orders].sort((a, b) =>
    (b.km || 0) - (a.km || 0) || (a.id - b.id))

  for (const o of ordered) {
    let best = null, bestEff = Infinity
    for (const d of drivers) {
      const cur = scoreOf(d, assign.get(d.id), byId, kmWeight)
      const tentative = cur + orderCost(o, d, kmWeight)
      const sameDistrict = districtsOf(assign.get(d.id)).has(o.district ?? null)
      const eff = tentative - (sameDistrict ? locality : 0)
      if (eff < bestEff - 1e-9 || (Math.abs(eff - bestEff) <= 1e-9 && (!best || d.id < best.id))) {
        bestEff = eff; best = d
      }
    }
    assign.get(best.id).push(o.id)
  }

  // ── Фаза 2: полировка локальным поиском.
  // Цель — лексикографически (разброс max−min, затем дисперсия). Дисперсия как вторичный
  // критерий выводит из «плато», когда максимум держат сразу несколько водителей.
  const scores = () => {
    const s = {}
    for (const d of drivers) s[d.id] = scoreOf(d, assign.get(d.id), byId, kmWeight)
    return s
  }
  const metric = (sc) => {
    const vals = Object.values(sc)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sumSq = vals.reduce((a, b) => a + (b - mean) ** 2, 0)
    return { spread: Math.max(...vals) - Math.min(...vals), sumSq }
  }
  const better = (m, best) =>
    m.spread < best.spread - 1e-9 ||
    (Math.abs(m.spread - best.spread) <= 1e-9 && m.sumSq < best.sumSq - 1e-9)

  const limit = maxPolish ?? orders.length * 8 + 40
  const ids = drivers.map((d) => d.id)
  for (let iter = 0; iter < limit; iter++) {
    const sc = scores()
    let bestMetric = metric(sc), bestOp = null

    // (a) перенос заявки A → B (любые водители)
    for (const A of ids) {
      for (const oid of assign.get(A)) {
        const costA = orderCost(byId.get(oid), driverById.get(A), kmWeight)
        for (const B of ids) {
          if (B === A) continue
          const costB = orderCost(byId.get(oid), driverById.get(B), kmWeight)
          const nsc = { ...sc, [A]: sc[A] - costA, [B]: sc[B] + costB }
          const m = metric(nsc)
          if (better(m, bestMetric)) { bestMetric = m; bestOp = { type: 'move', oid, A, B } }
        }
      }
    }
    // (b) обмен заявками между водителями A и B
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = ids[i], B = ids[j]
        for (const oa of assign.get(A)) {
          for (const ob of assign.get(B)) {
            const nA = sc[A] - orderCost(byId.get(oa), driverById.get(A), kmWeight) + orderCost(byId.get(ob), driverById.get(A), kmWeight)
            const nB = sc[B] - orderCost(byId.get(ob), driverById.get(B), kmWeight) + orderCost(byId.get(oa), driverById.get(B), kmWeight)
            const nsc = { ...sc, [A]: nA, [B]: nB }
            const m = metric(nsc)
            if (better(m, bestMetric)) { bestMetric = m; bestOp = { type: 'swap', oa, ob, A, B } }
          }
        }
      }
    }

    if (!bestOp) break
    if (bestOp.type === 'move') {
      remove(assign.get(bestOp.A), bestOp.oid); assign.get(bestOp.B).push(bestOp.oid)
    } else {
      remove(assign.get(bestOp.A), bestOp.oa); remove(assign.get(bestOp.B), bestOp.ob)
      assign.get(bestOp.A).push(bestOp.ob); assign.get(bestOp.B).push(bestOp.oa)
    }
  }

  // ── Сборка результата.
  const assignments = drivers.map((d) => {
    const oids = assign.get(d.id)
    let trips = 0, km = 0
    for (const oid of oids) {
      const o = byId.get(oid)
      trips += tripsOf(o, d)
      km += o.km || 0
    }
    return {
      driver_id: d.id, driver_name: d.name, capacity: d.capacity, empty_capacity: d.empty_capacity ?? 2,
      order_ids: oids.slice(),
      trips, km: round2(km),
      score: round3(scoreOf(d, oids, byId, kmWeight)),
    }
  })
  return { assignments, unassigned: [], spread: round3(spreadOf(scores())), kmWeight }
}

function remove(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1) }
function round2(x) { return Math.round(x * 100) / 100 }
function round3(x) { return Math.round(x * 1000) / 1000 }
