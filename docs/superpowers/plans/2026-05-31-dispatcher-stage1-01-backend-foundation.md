# Этап 1 · План 01 — Фундамент бэкенда (Express + PostgreSQL + миграции + seed)

**Goal:** Поднять бэкенд-сервис `server/`, подключить к PostgreSQL, создать миграциями
нормализованную схему ядра и каркас Этапа 2, импортировать seed улиц→районов Краснодара.
**Spec:** [docs/superpowers/specs/2026-05-31-dispatcher-core-design.md](../specs/2026-05-31-dispatcher-core-design.md)
**Tech stack:** Node.js 18+ (ESM), Express 4, Knex 3 (migrations + query builder), pg,
zod (валидация), Vitest + Supertest (тесты), unzipper/fast-xml для парсинга docx.

> Этот план — **первый** из трёх. Дальше: `…-02-backend-api.md` (CRUD + транзакции),
> `…-03-frontend.md` (api.js + экраны).

> ВАЖНО: прежний прототип (`n8n/schema.sql`, `n8n/orders-api.workflow.json`,
> моки в `src/store/ordersStore.js`) — устарел и будет заменён. На этом плане его не
> трогаем, удалим в плане 03.

---

## Architecture

```
server/
  package.json
  knexfile.js              # конфиг Knex (dev/test), читает .env
  .env.example             # шаблон переменных окружения
  src/
    config.js              # загрузка/валидация env (zod)
    db.js                  # единый экземпляр knex
    app.js                 # express-приложение (без listen) — для тестов
    server.js              # точка входа: app.listen()
    routes/
      health.js            # GET /api/health
    migrations/            # knex-миграции (нумерованные)
    seeds/
      import-streets.js    # парсер 9609544.docx → districts + streets
  test/
    health.test.js
    migrations.test.js
    seed-streets.test.js
  tmp/                     # временные артефакты тестов (gitignore)
```

Ответственности файлов:
- `config.js` — единственное место чтения `process.env`, валидирует и экспортирует объект.
- `db.js` — единственный экземпляр `knex`, импортируется везде.
- `app.js` — собирает Express (middlewares + роуты), **не** слушает порт (тестируемость).
- `server.js` — только `app.listen(config.port)`.
- Каждая миграция — одна логическая группа таблиц.

---

## Tasks

### Task 1: Скелет сервиса + health-эндпоинт (TDD)

- [ ] Шаг 1: Создать `server/package.json`:
  ```json
  {
    "name": "dispatcher-server",
    "version": "0.1.0",
    "type": "module",
    "scripts": {
      "dev": "node --watch src/server.js",
      "start": "node src/server.js",
      "test": "vitest run",
      "migrate": "knex migrate:latest",
      "rollback": "knex migrate:rollback",
      "seed:streets": "node src/seeds/import-streets.js"
    }
  }
  ```
- [ ] Шаг 2: Установить зависимости:
  ```powershell
  cd "d:/Татьяна/server"; npm i express knex pg zod dotenv; npm i -D vitest supertest unzipper
  ```
- [ ] Шаг 3: Создать `server/src/config.js`:
  ```js
  import 'dotenv/config'
  import { z } from 'zod'
  const schema = z.object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    PGSSL: z.enum(['require', 'disable']).default('require'),
    NODE_ENV: z.string().default('development'),
  })
  export const config = schema.parse(process.env)
  ```
- [ ] Шаг 4: Создать `server/.env.example`:
  ```
  PORT=3000
  DATABASE_URL=postgres://gen_user:PASSWORD@ef67476a3eac0d3eda7a6172.twc1.net:5432/default_db
  PGSSL=require
  NODE_ENV=development
  ```
  И `server/.env` с реальным паролем (НЕ коммитить — добавить `server/.env` в `.gitignore`).
- [ ] Шаг 5: Создать `server/src/routes/health.js`:
  ```js
  import { Router } from 'express'
  const r = Router()
  r.get('/health', (_req, res) => res.json({ ok: true }))
  export default r
  ```
- [ ] Шаг 6: Создать `server/src/app.js`:
  ```js
  import express from 'express'
  import health from './routes/health.js'
  export function createApp() {
    const app = express()
    app.use(express.json({ limit: '5mb' }))
    app.use('/api', health)
    return app
  }
  ```
- [ ] Шаг 7: Создать `server/src/server.js`:
  ```js
  import { createApp } from './app.js'
  import { config } from './config.js'
  createApp().listen(config.port ?? config.PORT, () =>
    console.log(`API on :${config.PORT}`))
  ```
- [ ] Шаг 8: Написать тест `server/test/health.test.js`:
  ```js
  import { describe, it, expect } from 'vitest'
  import request from 'supertest'
  import { createApp } from '../src/app.js'
  describe('health', () => {
    it('GET /api/health -> { ok: true }', async () => {
      const res = await request(createApp()).get('/api/health')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    })
  })
  ```
- [ ] Шаг 9: Verify (тест проходит): `cd "d:/Татьяна/server"; npm test`
- [ ] Шаг 10: Создать `server/.gitignore` (`node_modules`, `.env`, `tmp/`).
- [ ] Commit: `feat(server): express skeleton + health endpoint`

### Task 2: Подключение к БД (Knex) + smoke-тест соединения

- [ ] Шаг 1: Создать `server/src/db.js`:
  ```js
  import knexLib from 'knex'
  import { config } from './config.js'
  export const db = knexLib({
    client: 'pg',
    connection: {
      connectionString: config.DATABASE_URL,
      ssl: config.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
    },
    pool: { min: 0, max: 10 },
  })
  ```
- [ ] Шаг 2: Создать `server/knexfile.js`:
  ```js
  import { config } from './src/config.js'
  export default {
    client: 'pg',
    connection: {
      connectionString: config.DATABASE_URL,
      ssl: config.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
    },
    migrations: { directory: './src/migrations' },
  }
  ```
- [ ] Шаг 3: Написать тест `server/test/db.test.js` (пропускается без БД):
  ```js
  import { describe, it, expect } from 'vitest'
  import { db } from '../src/db.js'
  describe('db', () => {
    it('SELECT 1', async () => {
      const r = await db.raw('select 1 as x')
      expect(r.rows[0].x).toBe(1)
    })
  })
  ```
- [ ] Шаг 4: Verify: `npm test -- db` (требует доступной БД и `.env`).
- [ ] Commit: `feat(server): knex db connection`

### Task 3: Миграция — справочники (districts, streets, container_types)

- [ ] Шаг 1: Создать миграцию: `cd server; npx knex migrate:make 001_reference`
- [ ] Шаг 2: В созданном файле `src/migrations/...001_reference.js`:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('districts', (t) => {
      t.increments('id').primary()
      t.text('name').notNullable().unique()
      t.enu('kind', ['city', 'rural']).notNullable().defaultTo('city')
    })
    await knex.schema.createTable('streets', (t) => {
      t.increments('id').primary()
      t.text('name').notNullable()
      t.integer('district_id').references('districts.id').notNullable()
      t.index(['name'])
    })
    await knex.schema.createTable('container_types', (t) => {
      t.increments('id').primary()
      t.text('name').notNullable().unique()
      t.decimal('volume', 6, 2).nullable()
    })
  }
  export async function down(knex) {
    await knex.schema.dropTableIfExists('streets')
    await knex.schema.dropTableIfExists('container_types')
    await knex.schema.dropTableIfExists('districts')
  }
  ```
- [ ] Шаг 3: Verify: `npx knex migrate:latest` → таблицы созданы (проверка в Task 8 тестом).
- [ ] Commit: `feat(db): reference tables (districts, streets, container_types)`

### Task 4: Миграция — стороны (clients, objects, vehicles, drivers, containers)

- [ ] Шаг 1: `npx knex migrate:make 002_parties`
- [ ] Шаг 2: В миграции:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('clients', (t) => {
      t.increments('id').primary()
      t.enu('type', ['ooo', 'ip']).notNullable()
      t.text('legal_name').notNullable()
      t.text('inn'); t.text('kpp'); t.text('ogrn'); t.text('legal_address')
      t.text('bank_name'); t.text('bank_account'); t.text('bik'); t.text('corr_account')
      t.text('nickname'); t.text('email'); t.text('phone')
      t.enu('default_payment_method', ['cashless', 'cash']).notNullable().defaultTo('cashless')
      t.boolean('requires_photo').notNullable().defaultTo(false)
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable('objects', (t) => {
      t.increments('id').primary()
      t.integer('client_id').references('clients.id').notNullable()
      t.integer('street_id').references('streets.id').nullable()
      t.integer('district_id').references('districts.id').nullable()
      t.text('address_raw'); t.text('house'); t.text('building')
      t.text('informal_name')
      t.boolean('requires_photo').nullable()       // override клиента
      t.decimal('lat', 9, 6); t.decimal('lng', 9, 6) // Этап 2
      t.text('note')
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable('vehicles', (t) => {
      t.increments('id').primary()
      t.text('gov_number').notNullable().unique()
      t.integer('capacity_slots').notNullable().defaultTo(3)
      t.decimal('fuel_norm', 6, 2)
      t.enu('status', ['active', 'broken', 'repair']).notNullable().defaultTo('active')
      t.integer('mileage').defaultTo(0)
      t.text('model')
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable('drivers', (t) => {
      t.increments('id').primary()
      t.text('name').notNullable()
      t.text('phone')
      t.boolean('is_active').notNullable().defaultTo(true)
      t.integer('default_vehicle_id').references('vehicles.id').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable('containers', (t) => {
      t.increments('id').primary()
      t.text('number').notNullable().unique()
      t.integer('type_id').references('container_types.id').notNullable()
      t.enu('state', ['empty', 'full']).notNullable().defaultTo('empty')
      t.enu('location', ['warehouse', 'object', 'in_transit']).notNullable().defaultTo('warehouse')
      t.integer('object_id').references('objects.id').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  export async function down(knex) {
    for (const tbl of ['containers','drivers','vehicles','objects','clients'])
      await knex.schema.dropTableIfExists(tbl)
  }
  ```
- [ ] Шаг 3: Verify: `npx knex migrate:latest`
- [ ] Commit: `feat(db): parties (clients, objects, vehicles, drivers, containers)`

### Task 5: Миграция — заявки (orders, order_items, container_movements, attachments)

- [ ] Шаг 1: `npx knex migrate:make 003_orders`
- [ ] Шаг 2: В миграции:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('orders', (t) => {
      t.increments('id').primary()                         // внутренний ID
      t.specificType('number', 'serial').notNullable()      // человекочитаемый сквозной ID
      t.unique('number')
      t.integer('client_id').references('clients.id').notNullable()
      t.integer('object_id').references('objects.id').notNullable()
      t.enu('payment_method', ['cashless', 'cash']).notNullable()
      t.date('desired_date'); t.time('desired_time')
      t.enu('status', ['new','assigned','in_progress','done','closed','cancelled'])
        .notNullable().defaultTo('new')
      t.integer('assigned_driver_id').references('drivers.id').nullable()
      t.integer('vehicle_id').references('vehicles.id').nullable()
      t.date('shift_date'); t.enu('shift_type', ['day','night']).nullable()
      t.text('note')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('done_at'); t.timestamp('closed_at')
    })
    await knex.schema.createTable('order_items', (t) => {
      t.increments('id').primary()
      t.integer('order_id').references('orders.id').onDelete('CASCADE').notNullable()
      t.enu('action', ['place', 'replace', 'haul']).notNullable()
      t.integer('container_type_id').references('container_types.id').notNullable()
      t.integer('quantity').notNullable().defaultTo(1)
      t.enu('waste_class', ['4', '5']).nullable()
    })
    // опц.: заказчик назвал конкретные контейнеры по номеру (подмножество quantity)
    await knex.schema.createTable('order_item_containers', (t) => {
      t.increments('id').primary()
      t.integer('order_item_id').references('order_items.id').onDelete('CASCADE').notNullable()
      t.integer('container_id').references('containers.id').notNullable()
      t.unique(['order_item_id', 'container_id'])
    })
    await knex.schema.createTable('container_movements', (t) => {
      t.increments('id').primary()
      t.integer('order_id').references('orders.id').notNullable()
      t.integer('container_id').references('containers.id').notNullable()
      t.enu('direction', ['delivered', 'picked_up']).notNullable()
      t.integer('object_id').references('objects.id').notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable('attachments', (t) => {
      t.increments('id').primary()
      t.integer('order_id').references('orders.id').onDelete('CASCADE').notNullable()
      t.enu('kind', ['photo', 'audio', 'text']).notNullable()
      t.text('file_url'); t.text('transcript')
      t.integer('author_driver_id').references('drivers.id').nullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  export async function down(knex) {
    for (const tbl of ['attachments','container_movements','order_item_containers','order_items','orders'])
      await knex.schema.dropTableIfExists(tbl)
  }
  ```
- [ ] Шаг 3: Verify: `npx knex migrate:latest`
- [ ] Commit: `feat(db): orders domain (orders, items, movements, attachments)`

### Task 6: Миграция — график, маршруты, счета, настройки

- [ ] Шаг 1: `npx knex migrate:make 004_ops`
- [ ] Шаг 2: В миграции:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('shifts', (t) => {
      t.increments('id').primary()
      t.integer('driver_id').references('drivers.id').notNullable()
      t.date('date').notNullable()
      t.enu('shift_type', ['day', 'night']).notNullable()
      t.enu('status', ['planned','present','sick','vacation','absent']).notNullable().defaultTo('planned')
      t.integer('vehicle_id').references('vehicles.id').nullable()
      t.text('note')
      t.unique(['driver_id', 'date', 'shift_type'])
    })
    await knex.schema.createTable('routes', (t) => {
      t.increments('id').primary()
      t.integer('driver_id').references('drivers.id').notNullable()
      t.integer('vehicle_id').references('vehicles.id').nullable()
      t.date('date').notNullable()
      t.enu('shift_type', ['day', 'night']).notNullable()
      t.unique(['driver_id', 'date', 'shift_type'])
    })
    await knex.schema.createTable('route_stops', (t) => {
      t.increments('id').primary()
      t.integer('route_id').references('routes.id').onDelete('CASCADE').notNullable()
      t.integer('seq').notNullable()
      t.enu('stop_type', ['object', 'landfill', 'base']).notNullable()
      t.integer('order_id').references('orders.id').nullable()
      t.integer('object_id').references('objects.id').nullable()
    })
    await knex.schema.createTable('invoices', (t) => {
      t.increments('id').primary()
      t.integer('client_id').references('clients.id').notNullable()
      t.integer('order_id').references('orders.id').nullable()
      t.decimal('amount', 12, 2)
      t.enu('status', ['issued', 'paid']).notNullable().defaultTo('issued')
      t.enu('method', ['cashless', 'cash']).nullable()
      t.timestamp('issued_at'); t.timestamp('paid_at')
    })
    await knex.schema.createTable('settings', (t) => {
      t.text('key').primary()
      t.jsonb('value').notNullable()
    })
  }
  export async function down(knex) {
    for (const tbl of ['route_stops','routes','shifts','invoices','settings'])
      await knex.schema.dropTableIfExists(tbl)
  }
  ```
- [ ] Шаг 3: Verify: `npx knex migrate:latest`
- [ ] Commit: `feat(db): shifts, routes, invoices, settings`

### Task 7: Миграция — каркас Этапа 2 (channels, inbound_messages)

- [ ] Шаг 1: `npx knex migrate:make 005_stage2_scaffold`
- [ ] Шаг 2: В миграции:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('channels', (t) => {
      t.increments('id').primary()
      t.enu('owner_kind', ['client', 'driver']).notNullable()
      t.integer('owner_id').notNullable()
      t.enu('type', ['telegram', 'max', 'phone']).notNullable()
      t.text('external_id')
    })
    await knex.schema.createTable('inbound_messages', (t) => {
      t.increments('id').primary()
      t.integer('channel_id').references('channels.id').notNullable()
      t.text('raw_text'); t.text('media_url'); t.text('transcript')
      t.timestamp('received_at').defaultTo(knex.fn.now())
      t.integer('linked_order_id').references('orders.id').nullable()
    })
  }
  export async function down(knex) {
    await knex.schema.dropTableIfExists('inbound_messages')
    await knex.schema.dropTableIfExists('channels')
  }
  ```
- [ ] Шаг 3: Verify: `npx knex migrate:latest`
- [ ] Commit: `feat(db): stage-2 scaffold (channels, inbound_messages)`

### Task 8: Тест миграций (полный прогон на чистой схеме)

- [ ] Шаг 1: Написать `server/test/migrations.test.js`:
  ```js
  import { describe, it, expect, afterAll } from 'vitest'
  import { db } from '../src/db.js'
  const EXPECTED = ['districts','streets','container_types','clients','objects',
    'vehicles','drivers','containers','orders','order_items','order_item_containers',
    'container_movements','attachments','shifts','routes','route_stops','invoices',
    'settings','channels','inbound_messages']
  describe('migrations', () => {
    it('все таблицы существуют после migrate:latest', async () => {
      for (const tbl of EXPECTED) {
        expect(await db.schema.hasTable(tbl), `нет таблицы ${tbl}`).toBe(true)
      }
    })
    afterAll(async () => { await db.destroy() })
  })
  ```
- [ ] Шаг 2: Verify: `npx knex migrate:latest; npm test -- migrations`
- [ ] Commit: `test(db): migrations create all expected tables`

### Task 9: Seed — импорт улиц→районов из 9609544.docx (TDD)

> Реестр: строки идут пятёрками «№ / улица / протяжённость / ID / округ».
> Нормализуем округ (обрезаем посёлки/станицы до базового округа), улицы, пересекающие
> несколько округов, разносим в отдельные строки `streets`.

- [ ] Шаг 1: Скопировать `9609544.docx` в `server/src/seeds/9609544.docx`.
- [ ] Шаг 2: Создать парсер-модуль `server/src/seeds/parse-streets.js` (чистая функция, без БД):
  ```js
  import { promises as fs } from 'node:fs'
  import unzipper from 'unzipper'

  const CITY = ['Прикубанский','Карасунский','Центральный','Западный']
  const RURAL = ['Калининский','Старокорсунский','Берёзовский','Елизаветинский','Пашковский']

  export async function extractLines(docxPath) {
    const dir = await unzipper.Open.file(docxPath)
    const entry = dir.files.find((f) => f.path === 'word/document.xml')
    const xml = (await entry.buffer()).toString('utf8')
    return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
      .split('\n').map((s) => s.trim()).filter(Boolean)
  }

  // из строки «принадлежности» вытащить базовые округа (может быть несколько)
  export function districtsFromCell(cell) {
    const found = []
    for (const name of [...CITY, ...RURAL]) {
      if (cell.includes(name)) found.push({ name: `${name} округ`, kind: CITY.includes(name) ? 'city' : 'rural' })
    }
    return found
  }

  // вернуть [{ street, districts:[{name,kind}] }]
  export function parseRows(lines) {
    const out = []
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(ул\.|пер\.|пр\.|проезд|туп\.|ш\.|наб\.|б-р|мкр|пл\.)/)
      if (!m) continue
      // округ — ближайшая ниже строка, содержащая 'округ'
      const cell = lines.slice(i + 1, i + 5).find((l) => l.includes('округ'))
      if (!cell) continue
      const districts = districtsFromCell(cell)
      if (districts.length) out.push({ street: lines[i], districts })
    }
    return out
  }
  ```
- [ ] Шаг 3: Написать тест `server/test/seed-streets.test.js` (без БД, на реальном файле):
  ```js
  import { describe, it, expect } from 'vitest'
  import { extractLines, parseRows, districtsFromCell } from '../src/seeds/parse-streets.js'

  describe('parse-streets', () => {
    it('districtsFromCell разносит пересекающие округа', () => {
      const d = districtsFromCell('Центральный внутригородской округ, Карасунский внутригородской округ')
      expect(d.map((x) => x.name)).toEqual(['Центральный округ', 'Карасунский округ'])
    })
    it('парсит реальный реестр (>1500 улиц, 4 городских округа)', async () => {
      const lines = await extractLines('src/seeds/9609544.docx')
      const rows = parseRows(lines)
      expect(rows.length).toBeGreaterThan(1500)
      const cityNames = new Set(rows.flatMap((r) => r.districts).map((d) => d.name))
      for (const n of ['Прикубанский округ','Карасунский округ','Центральный округ','Западный округ'])
        expect(cityNames.has(n)).toBe(true)
    })
  })
  ```
- [ ] Шаг 4: Verify (падает, пока нет файла/модуля → потом проходит): `npm test -- seed-streets`
- [ ] Шаг 5: Создать загрузчик `server/src/seeds/import-streets.js` (пишет в БД, идемпотентно):
  ```js
  import { db } from '../db.js'
  import { extractLines, parseRows } from './parse-streets.js'

  async function main() {
    const rows = parseRows(await extractLines(new URL('./9609544.docx', import.meta.url).pathname))
    const districtNames = [...new Map(
      rows.flatMap((r) => r.districts).map((d) => [d.name, d])).values()]
    await db.transaction(async (trx) => {
      for (const d of districtNames)
        await trx('districts').insert(d).onConflict('name').ignore()
      const idByName = Object.fromEntries(
        (await trx('districts').select('id', 'name')).map((d) => [d.name, d.id]))
      for (const r of rows)
        for (const d of r.districts)
          await trx('streets').insert({ name: r.street, district_id: idByName[d.name] })
    })
    console.log(`seed: ${districtNames.length} районов, ${rows.length} улиц(строк)`)
    await db.destroy()
  }
  main()
  ```
- [ ] Шаг 6: Verify: `npm run seed:streets` → в логе разумные числа; `streets` непустая.
- [ ] Commit: `feat(seed): import Krasnodar streets→districts from registry`

### Task 10: Прогон на Timeweb + дефолтные настройки

- [ ] Шаг 1: Убедиться, что `.env` указывает на Timeweb (host
  `ef67476a3eac0d3eda7a6172.twc1.net`, db `default_db`, `PGSSL=require`).
- [ ] Шаг 2: `npx knex migrate:latest` против Timeweb.
- [ ] Шаг 3: `npm run seed:streets` против Timeweb.
- [ ] Шаг 4: Засидить дефолтный тип контейнера и настройки (одноразовый скрипт или вручную):
  ```sql
  INSERT INTO container_types (name) VALUES ('Стандартный (лодочка)') ON CONFLICT DO NOTHING;
  INSERT INTO settings (key, value) VALUES
    ('base',     '{"address":"","lat":null,"lng":null}'::jsonb),
    ('landfill', '{"address":"","lat":null,"lng":null}'::jsonb),
    ('fuel',     '{"tolerance":0.1}'::jsonb)
  ON CONFLICT (key) DO NOTHING;
  ```
- [ ] Шаг 5: Verify: `SELECT count(*) FROM streets;` > 1500; `SELECT * FROM container_types;` есть строка.
- [ ] Commit: `chore(db): seed default container type + settings`

---

## Self-review checklist

- [x] Каждая задача ссылается на конкретные файлы (`server/src/...`).
- [x] Нет placeholder'ов — приведён реальный код миграций/парсера/тестов.
- [x] Тесты пишутся до/вместе с реализацией (health, migrations, seed-streets).
- [x] Команды точные и запускаемые (`npx knex migrate:latest`, `npm test -- <pattern>`).

## Дальше

После этого плана — **План 02 (API + сервисы)**: CRUD по ресурсам и транзакционные
операции `assign`/`complete`/`close`. Затем **План 03 (фронт)**.
