# Этап 1 · План 02 — Backend API + сервисы (CRUD + транзакции)

**Goal:** REST-API по ресурсам ядра и транзакционные операции жизненного цикла заявки
(`assign` / `complete` / `close`) с корректным обновлением инвентаря контейнеров.
**Spec:** [docs/superpowers/specs/2026-05-31-dispatcher-core-design.md](../specs/2026-05-31-dispatcher-core-design.md)
**Предусловие:** выполнен План 01 (схема + соединение БД).
**Tech stack:** Express 4, Knex 3, zod, Vitest + Supertest.

---

## Architecture

```
server/src/
  validators/        # zod-схемы входных данных по ресурсу
    client.js  object.js  order.js  shift.js  container.js  vehicle.js  driver.js
  services/          # бизнес-логика и транзакции (без express)
    crud.js          # фабрика типового CRUD над таблицей
    orders.js        # assign / complete / close + сборка заявки
    inventory.js     # применение движений к containers (ядро учёта)
    shifts.js        # upsert строки графика, выборка доступных водителей
    objects.js       # объект + текущий инвентарь, резолв улицы→района
  controllers/       # тонкие обёртки: валидация -> service -> res
  routes/
    index.js         # сборка всех роутов под /api
  middleware/
    error.js         # единый обработчик ошибок (zod -> 400, прочее -> 500)
```

Принцип: **контроллеры тонкие**, вся логика — в `services/`. Транзакции — только в
сервисах. Валидация — zod на входе контроллера.

---

## Tasks

### Task 1: Каркас роутинга + обработчик ошибок (TDD)

- [ ] Шаг 1: Создать `server/src/middleware/error.js`:
  ```js
  import { ZodError } from 'zod'
  export function errorHandler(err, _req, res, _next) {
    if (err instanceof ZodError) return res.status(400).json({ error: 'validation', issues: err.issues })
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    return res.status(500).json({ error: 'internal' })
  }
  export const notFound = (_req, res) => res.status(404).json({ error: 'not_found' })
  ```
- [ ] Шаг 2: Создать `server/src/routes/index.js` (пока подключает только health):
  ```js
  import { Router } from 'express'
  import health from './health.js'
  const api = Router()
  api.use(health)
  export default api
  ```
- [ ] Шаг 3: Обновить `server/src/app.js`: подключить `api` под `/api`, добавить
  `errorHandler` последним middleware, `notFound` для неизвестных путей `/api/*`.
- [ ] Шаг 4: Тест `server/test/error.test.js`: неизвестный роут `/api/nope` → 404.
- [ ] Шаг 5: Verify: `npm test -- error`
- [ ] Commit: `feat(api): routing skeleton + error handler`

### Task 2: Типовой CRUD-сервис + первый ресурс `clients` (TDD)

- [ ] Шаг 1: Создать `server/src/services/crud.js`:
  ```js
  import { db } from '../db.js'
  export function makeCrud(table) {
    return {
      list: (where = {}) => db(table).where(where).orderBy('id'),
      get: async (id) => (await db(table).where({ id }).first()) ?? null,
      create: async (data) => (await db(table).insert(data).returning('*'))[0],
      update: async (id, data) => (await db(table).where({ id }).update(data).returning('*'))[0] ?? null,
      remove: (id) => db(table).where({ id }).del(),
    }
  }
  ```
- [ ] Шаг 2: Создать `server/src/validators/client.js` (zod-схема create/update по полям
  из миграции `clients`: `type` enum, `legal_name` required, остальные optional).
- [ ] Шаг 3: Создать `server/src/controllers/clients.js` (list/get/create/update/remove,
  валидируя body через zod).
- [ ] Шаг 4: Создать `server/src/routes/clients.js` (Router c 5 маршрутами) и подключить
  в `routes/index.js` под `/clients`.
- [ ] Шаг 5: Тест `server/test/clients.test.js` (Supertest, на тестовой БД):
  POST создаёт, GET возвращает, PATCH меняет `nickname`, DELETE удаляет, POST с пустым
  `legal_name` → 400.
- [ ] Шаг 6: Verify: `npm test -- clients`
- [ ] Commit: `feat(api): clients CRUD`

### Task 3: Тиражирование CRUD на простые ресурсы

> Для каждого: validator + controller + route + тест happy-path и 400.

- [ ] Шаг 1: `container_types` (`/container-types`).
- [ ] Шаг 2: `vehicles` (`/vehicles`) — проверка уникальности `gov_number` → 409 при дубле.
- [ ] Шаг 3: `drivers` (`/drivers`).
- [ ] Шаг 4: `containers` (`/containers`) + фильтр `GET ?object_id=&location=`.
- [ ] Шаг 5: `districts`, `streets` — только чтение + `GET /streets?q=` (поиск по имени,
  возвращает с `district`). Тест: поиск «Красная» возвращает строки с district.
- [ ] Шаг 6: Verify по каждому: `npm test -- <ресурс>`
- [ ] Commit (по ресурсу): `feat(api): <resource> CRUD`

### Task 4: Объекты + текущий инвентарь (TDD)

- [ ] Шаг 1: Создать `server/src/services/objects.js`:
  - `createObject(data)` — если передан `street_id`, проставить `district_id` из улицы.
  - `inventory(objectId)` — `db('containers').where({ object_id, location: 'object' })`
    с join на `container_types` (что и сколько стоит).
- [ ] Шаг 2: Контроллер/роуты `/objects` (CRUD) + `GET /objects/:id/inventory` +
  вложенный `GET /clients/:id/objects`.
- [ ] Шаг 3: Тест `server/test/objects.test.js`: создание объекта со `street_id`
  автоматически проставляет `district_id`; `inventory` пуст для нового объекта.
- [ ] Шаг 4: Verify: `npm test -- objects`
- [ ] Commit: `feat(api): objects + inventory`

### Task 5: График (shifts) + доступные водители (TDD)

- [ ] Шаг 1: Создать `server/src/services/shifts.js`:
  - `upsert({driver_id,date,shift_type,status,vehicle_id})` — `onConflict([driver_id,date,shift_type]).merge()`.
  - `range(from,to)` — все смены в диапазоне (для календаря).
  - `availableDrivers(date, shift_type)` — водители со `status='present'` на дату, с
    подтянутой машиной (`vehicle_id` или `drivers.default_vehicle_id`).
- [ ] Шаг 2: Роуты: `GET /shifts?from&to`, `PUT /shifts` (upsert),
  `GET /shifts/available?date&shift_type`.
- [ ] Шаг 3: Тест `server/test/shifts.test.js`: upsert идемпотентен; `available`
  возвращает только `present`, а `sick`/`absent` — нет.
- [ ] Шаг 4: Verify: `npm test -- shifts`
- [ ] Commit: `feat(api): shifts calendar + available drivers`

### Task 6: Создание/чтение заявок (TDD)

- [ ] Шаг 1: `server/src/validators/order.js` — zod: `object_id` required, `items[]`
  (`action` enum, `container_type_id`, `quantity>=1`, `waste_class?`,
  **`requested_container_ids?: number[]`** — когда заказчик назвал конкретные номера),
  `payment_method?` (если не задан — берётся `default_payment_method` клиента объекта).
- [ ] Шаг 2: `server/src/services/orders.js`:
  - `createOrder(payload)` — транзакция: вставка `orders` (резолв client_id из объекта,
    payment_method по умолчанию из клиента) + `order_items`; для каждой позиции с
    `requested_container_ids` — вставка строк в `order_item_containers` (валидировать,
    что эти контейнеры сейчас стоят на этом объекте, иначе 409 `container_not_on_object`).
  - `getOrder(id)` — заявка с `items` (+ привязанные `requested_container_ids`),
    объектом, клиентом, движениями, вложениями.
  - `listOrders(filter)` — фильтры `status`, `shift_date`, `assigned_driver_id`,
    `district_id` (через join object→street→district).
- [ ] Шаг 3: Роуты `/orders`: `GET` (list+filters), `GET /:id`, `POST`.
- [ ] Шаг 4: Тест `server/test/orders-create.test.js`: POST создаёт заявку с позициями;
  `number` автоинкрементится; `payment_method` подставляется из клиента, если не задан;
  позиция с `requested_container_ids` (контейнеры на объекте) → строки в
  `order_item_containers`; те же id, но не на объекте → 409 `container_not_on_object`.
- [ ] Шаг 5: Verify: `npm test -- orders-create`
- [ ] Commit: `feat(api): create & read orders`

### Task 7: Назначение водителя — `assign` (TDD)

- [ ] Шаг 1: В `services/orders.js` добавить `assign(id, {driver_id, shift_date,
  shift_type, vehicle_id})` — проверка: водитель `present` в эту смену (иначе ошибка
  409 `driver_not_available`); статус `new`→`assigned`.
- [ ] Шаг 2: Роут `POST /orders/:id/assign`.
- [ ] Шаг 3: Тест: назначение на `present`-водителя ок; на `sick` → 409; статус меняется.
- [ ] Шаг 4: Verify: `npm test -- orders-assign`
- [ ] Commit: `feat(api): assign order to driver`

### Task 8: Закрытие у водителя — `complete` + инвентарь (ядро, TDD)

> Самая важная транзакция. Движения применяются к `containers` атомарно.

- [ ] Шаг 1: Создать `server/src/services/inventory.js`:
  ```js
  // применить одно движение к контейнеру в рамках транзакции
  export async function applyMovement(trx, { container_id, direction, object_id }) {
    if (direction === 'picked_up') {
      // забрали с объекта: уезжает в рейс, помечаем полным, снимаем с объекта
      await trx('containers').where({ id: container_id })
        .update({ location: 'in_transit', state: 'full', object_id: null })
    } else { // delivered: привезли пустой и поставили на объект
      await trx('containers').where({ id: container_id })
        .update({ location: 'object', state: 'empty', object_id })
    }
  }
  ```
- [ ] Шаг 2: В `services/orders.js` добавить `complete(id, { movements, attachments })`:
  ```js
  export async function complete(id, { movements = [], attachments = [] }) {
    return db.transaction(async (trx) => {
      const order = await trx('orders').where({ id }).first()
      if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
      for (const m of movements) {
        await trx('container_movements').insert({
          order_id: id, container_id: m.container_id,
          direction: m.direction, object_id: order.object_id })
        await applyMovement(trx, { ...m, object_id: order.object_id })
      }
      for (const a of attachments)
        await trx('attachments').insert({ order_id: id, ...a })
      await trx('orders').where({ id })
        .update({ status: 'done', done_at: trx.fn.now() })
      return trx('orders').where({ id }).first()
    })
  }
  ```
- [ ] Шаг 3: Роут `POST /orders/:id/complete`.
- [ ] Шаг 4: Тест `server/test/orders-complete.test.js` (ядро инвентаря):
  - подготовить объект и контейнер на складе;
  - `delivered` → контейнер на объекте (`location='object'`, `object_id` совпал);
  - `inventory(objectId)` теперь содержит 1 контейнер;
  - `picked_up` контейнера с объекта → `location='in_transit'`, `state='full'`,
    `inventory` снова пуст;
  - статус заявки стал `done`, `done_at` проставлен;
  - при ошибочном движении (несуществующий container_id) — **вся транзакция
    откатывается**, статус остаётся прежним.
- [ ] Шаг 5: Verify: `npm test -- orders-complete`
- [ ] Commit: `feat(api): complete order with transactional inventory`

### Task 9: Отправка заказчику — `close` (TDD)

- [ ] Шаг 1: `close(id)` — статус `done`→`closed` + `closed_at`; из других статусов → 409.
- [ ] Шаг 2: Роут `POST /orders/:id/close`.
- [ ] Шаг 3: Тест: close после done → `closed`; close из `new` → 409.
- [ ] Шаг 4: Verify: `npm test -- orders-close`
- [ ] Commit: `feat(api): close order (reported to client)`

### Task 10: Маршрут дня (routes) + вложения + счета (лёгкое)

- [ ] Шаг 1: `routes`/`route_stops`: `GET /routes?driver_id&date&shift_type`,
  `PUT /routes/:id/stops` (переупорядочивание `seq`). Тест порядка остановок.
- [ ] Шаг 2: `attachments`: `POST /orders/:id/attachments` (на Этапе 1 — приём
  `file_url`/`text`/`transcript` как данные; загрузка файлов — отдельно, см. открытый
  вопрос в спеке).
- [ ] Шаг 3: `invoices`: CRUD-минимум (`POST`, `GET ?client_id`, `PATCH /:id` статус).
- [ ] Шаг 4: Verify: `npm test -- routes; npm test -- invoices`
- [ ] Commit: `feat(api): routes, attachments, invoices`

### Task 11: Тестовая БД и изоляция тестов

- [ ] Шаг 1: Добавить `server/.env.test` с отдельной тестовой БД (локальный Postgres
  через Docker **или** отдельная БД на Timeweb — НЕ `default_db`).
- [ ] Шаг 2: `server/test/setup.js`: перед всеми — `migrate:latest`; перед каждым тестом
  — очистка таблиц (`TRUNCATE ... RESTART IDENTITY CASCADE`), после всех — `db.destroy()`.
  Подключить через `vitest.config.js` (`globalSetup`/`setupFiles`).
- [ ] Шаг 3: Verify: весь набор зелёный: `npm test`
- [ ] Commit: `test(server): isolated test database + truncation`

---

## Self-review checklist

- [x] Каждая задача — конкретные файлы (`services/`, `controllers/`, `routes/`, `test/`).
- [x] Нет placeholder'ов: приведён код `inventory.applyMovement` и `orders.complete`.
- [x] Тесты до/вместе с реализацией; ядро (`complete`) покрыто откатом транзакции.
- [x] Команды точные: `npm test -- <pattern>`.

## Дальше

**План 03 (фронт)** — перевод React со сторов-моков на `api.js` и новые экраны.
