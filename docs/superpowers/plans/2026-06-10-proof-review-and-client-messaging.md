# Проверка пруфов и сообщение клиенту — план реализации

**Goal:** Менеджер/директор проверяет медиа-пруфы по участкам (галерея в карточке + лента «Проверка», приёмка/возврат на переделку). При приёмке всей заявки генерится публичный фотоотчёт + текст для диплинка в личку + событие в outbox для ботов.

**Spec:** [2026-06-10-proof-review-and-client-messaging-design.md](../specs/2026-06-10-proof-review-and-client-messaging-design.md)

**Tech stack:**
- Бэкенд: Node ESM, Express, Knex, PostgreSQL (Timeweb managed). Тесты: Vitest + supertest, БД `dispatcher_test`, `beforeEach(resetDb)` (TRUNCATE CASCADE).
- Запуск тестов: `cd server; npm test` (vitest). Один файл: `npm test -- proof-review`.
- Миграции: `cd server; $env:NODE_TLS_REJECT_UNAUTHORIZED=0; npm run migrate` (PowerShell, TLS MITM на dev-машине).
- Фронт: React 19 + Vite + Zustand. Линт: `npm run lint` (из корня `d:\Татьяна`). У фронта нет юнит-тестов — верификация через `npm run lint` + ручная проверка в dev (`npm run dev -- --port 5174`).
- Бот: grammY, отдельный процесс. Доставка задач водителю — **pull** (водитель открывает «Задачи на …»), НЕ push. Outbox бот не поллит.

## Архитектура

### Принятые решения (из спека)
- `proof_status` — **отдельная ось** на `order_subtasks` (`unreviewed|accepted|rejected`), НЕ статус заявки. Статус `review` в конвейере означает проверку *до* выезда — его не трогаем.
- **Возврат на переделку** → под-задача `pending`, `proof_status=rejected`; заявка, если была `done`, → `in_progress` к **тому же** водителю (`assigned_driver_id` не меняется). Уведомление водителю — **pull**: при возврате под-задача снова `pending` и всплывёт в «Задачах»; `review_comment` показывается в карточке задачи бота как «⚠ Возвращено: …». Отдельный push-поллер НЕ вводим (его в боте нет; отдельная задача-расширение при необходимости).
- **Приёмка заявки** = все под-задачи получили `proof_status=accepted`. Триггерит: `orders.public_token` (один раз), запись `client_messages`, событие `client_report_ready` в outbox. Идемпотентно.
- **Публичный отчёт** `GET /r/:token` — app-level (до `/api`-авторизации), read-only, бессрочный, без отзыва.
- **Мультитенантность не блокируем:** новые таблицы/поля без хардкода tenant, но и без company_id сейчас (его в схеме ещё нет) — структура совместима с будущим добавлением.

### Затрагиваемые файлы
**Бэкенд (новое):**
- `server/src/migrations/033_proof_review.js` — поля проверки на `order_subtasks`.
- `server/src/migrations/034_order_public_token.js` — `orders.public_token`.
- `server/src/migrations/035_client_messages.js` — лог сообщений клиенту.
- `server/src/services/proofReview.js` — `acceptSubtask`, `rejectSubtask`, `subtasksForReview`, хук `maybeAcceptOrder`.
- `server/src/services/clientMessaging.js` — `buildReportToken`, `renderTemplate`, `buildDeepLink`, `onOrderAccepted` (enqueue + лог), `publicReport(token)`.
- `server/src/routes/proofReview.js` — `POST /subtasks/:id/accept`, `POST /subtasks/:id/reject`, `GET /proof-review` (очередь).
- `server/src/routes/publicReport.js` — `GET /r/:token` (app-level).
- `server/src/validators/proofReview.js` — zod-схемы (reject comment).

**Бэкенд (правки):**
- `server/src/services/orders.js` — `assembleOrder` уже отдаёт `attachments`; добавить `subtasks` с проверочными полями в выборку.
- `server/src/routes/index.js` — смонтировать `proofReview` под авторизацией (manager|director).
- `server/src/app.js` — смонтировать `publicReport` до `/api`.
- `server/src/bot/index.js` — в рендере задачи показывать «⚠ Возвращено: <review_comment>» для под-задачи с `proof_status=rejected`.
- `server/src/seeds/demo-*.js` — picsum-пруфы на части под-задач.
- `server/test/reset.js` — добавить `client_messages` в TABLES.

**Фронт (новое):**
- `src/components/admin/ProofGallery.jsx` — лента вложений по под-задаче + лайтбокс + кнопки accept/reject.
- `src/pages/ProofReview.jsx` — страница-очередь «Проверка».
- `src/components/admin/ClientMessageModal.jsx` — выбор шаблона, превью, копирование текста, кнопка диплинка.
- `src/store/proofReviewStore.js` — список очереди + accept/reject.

**Фронт (правки):**
- `src/components/admin/OrderModal.jsx` — встроить `ProofGallery` в блок участков + кнопка «✉ Сообщить клиенту».
- `src/pages/Clients.jsx` — кнопка «✉ Сообщить клиенту» в карточке клиента.
- `src/pages/Settings.jsx` — редактор шаблонов (settings key `client_message_templates`).
- `src/App.jsx` — роут `/proof-review` (manager|director).
- `src/components/layout/AppSidebar.jsx` — пункт «Проверка» (roles manager|director).
- `src/lib/api.js` / `src/store/ordersStore.js` — экшены при необходимости.

### Контракт данных

`order_subtasks` (после 033): + `proof_status enum('unreviewed','accepted','rejected') default 'unreviewed'`, `reviewed_by int FK users SET NULL`, `reviewed_at timestamp`, `review_comment text`, `reject_count int default 0`.

`orders` (после 034): + `public_token text unique nullable`.

`client_messages` (035): `id`, `order_id FK orders CASCADE`, `template text`, `body text`, `public_token text`, `sent_by int FK users SET NULL`, `channels text` (csv: `copied`/`outbox`), `created_at`.

Событие outbox `client_report_ready`: `payload { number, public_token, report_url, body, results:[{sub_no, section_id, status}] }`, `event_key = report:<orderId>`.

Шаблоны в `settings` под ключом `client_message_templates` — массив `{ id, title, body }` с плейсхолдерами `{client} {number} {date} {address} {driver} {sections} {amount} {report_url}`.

---

## Tasks

### Task 1: Миграция 033 — поля проверки пруфов
- [ ] Создать `server/src/migrations/033_proof_review.js` с `up`/`down`:
  ```js
  export async function up(knex) {
    await knex.schema.alterTable('order_subtasks', (t) => {
      t.enu('proof_status', ['unreviewed', 'accepted', 'rejected']).notNullable().defaultTo('unreviewed')
      t.integer('reviewed_by').references('users.id').onDelete('SET NULL').nullable()
      t.timestamp('reviewed_at')
      t.text('review_comment')
      t.integer('reject_count').notNullable().defaultTo(0)
    })
  }
  export async function down(knex) {
    await knex.schema.alterTable('order_subtasks', (t) => {
      t.dropColumn('proof_status'); t.dropColumn('reviewed_by')
      t.dropColumn('reviewed_at'); t.dropColumn('review_comment'); t.dropColumn('reject_count')
    })
  }
  ```
- [ ] Применить: `cd server; $env:NODE_TLS_REJECT_UNAUTHORIZED=0; npm run migrate`
- [ ] Verify: `npm run migrate` повторно — «Already up to date» (идемпотентно).
- [ ] Commit: `git commit -m "feat(proof): миграция 033 — поля проверки пруфов на order_subtasks"`

### Task 2: Миграция 034 — public_token на orders
- [ ] Создать `server/src/migrations/034_order_public_token.js`:
  ```js
  export async function up(knex) {
    await knex.schema.alterTable('orders', (t) => { t.text('public_token').unique().nullable() })
  }
  export async function down(knex) {
    await knex.schema.alterTable('orders', (t) => { t.dropColumn('public_token') })
  }
  ```
- [ ] Применить миграцию (см. Task 1).
- [ ] Commit: `git commit -m "feat(client-msg): миграция 034 — public_token на orders"`

### Task 3: Миграция 035 — client_messages
- [ ] Создать `server/src/migrations/035_client_messages.js`:
  ```js
  export async function up(knex) {
    await knex.schema.createTable('client_messages', (t) => {
      t.increments('id').primary()
      t.integer('order_id').references('orders.id').onDelete('CASCADE').notNullable()
      t.text('template'); t.text('body').notNullable(); t.text('public_token')
      t.integer('sent_by').references('users.id').onDelete('SET NULL').nullable()
      t.text('channels').notNullable().defaultTo('')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.index(['order_id'])
    })
  }
  export async function down(knex) { await knex.schema.dropTableIfExists('client_messages') }
  ```
- [ ] Добавить `'client_messages'` в массив `TABLES` в `server/test/reset.js` (перед `'orders'`).
- [ ] Применить миграцию.
- [ ] Commit: `git commit -m "feat(client-msg): миграция 035 — лог client_messages"`

### Task 4: clientMessaging — рендер шаблона и диплинк (чистые функции, TDD)
- [ ] Тест `server/test/client-messaging.test.js`: `renderTemplate(body, vars)` подставляет `{client}/{number}/{report_url}`, неизвестный плейсхолдер оставляет как есть; `buildDeepLink('+79180001122','telegram')` → `https://t.me/+79180001122`; `buildDeepLink(phone,'max')` → корректный max-url; пустой телефон → `null`.
- [ ] Verify (red): `cd server; npm test -- client-messaging` — падает (модуля нет).
- [ ] Создать `server/src/services/clientMessaging.js` с `renderTemplate`, `buildDeepLink`, `buildReportToken()` (crypto.randomUUID без дефисов, 24 симв.). Без обращения к БД в этих функциях.
- [ ] Verify (green): `npm test -- client-messaging`.
- [ ] Commit: `git commit -m "feat(client-msg): renderTemplate + buildDeepLink + token (unit)"`

### Task 5: proofReview-сервис — accept/reject под-задачи (TDD)
- [ ] Тест `server/test/proof-review.test.js` (supertest + resetDb), фикстуры: клиент→объект→2 участка→заявка `in_progress` с 2 под-задачами `done` + по 1 attachment; пользователь-менеджер для `reviewed_by` (или null).
  - `acceptSubtask(id, userId)` → `proof_status='accepted'`, `reviewed_by/at` заполнены.
  - `rejectSubtask(id, userId, 'переснимите')` → под-задача `status='pending'`, `proof_status='rejected'`, `reject_count=1`, заявка `done`→`in_progress`, `assigned_driver_id` не изменился.
  - повторный `rejectSubtask` → `reject_count=2`.
- [ ] Verify (red): `npm test -- proof-review`.
- [ ] Создать `server/src/services/proofReview.js`:
  - `acceptSubtask(subtaskId, userId)` — транзакция: апдейт под-задачи; затем вызвать `maybeAcceptOrder(orderId, trx)` (Task 7); вернуть под-задачу.
  - `rejectSubtask(subtaskId, userId, comment)` — транзакция: под-задача `status='pending', proof_status='rejected', review_comment=comment, reject_count++ , reviewed_by/at`; если заявка `done` → `status='in_progress'`.
  - `subtasksForReview({ date, driver_id })` — заявки с `done` под-задачами и `proof_status='unreviewed'`, с агрегатом вложений.
- [ ] Verify (green): `npm test -- proof-review`.
- [ ] Commit: `git commit -m "feat(proof): accept/reject под-задач (сервис + тесты)"`

### Task 6: assembleOrder отдаёт под-задачи с проверочными полями (TDD)
- [ ] В `server/test/proof-review.test.js` добавить: `GET /api/orders/:id` возвращает `subtasks[]` с `proof_status`, `review_comment`, и вложенным `attachments` каждой под-задачи.
- [ ] Verify (red): `npm test -- proof-review`.
- [ ] В `server/src/services/orders.js` → `assembleOrder`: добавить выборку `order.subtasks` из `order_subtasks` (orderBy `sub_no`) и подвесить `attachments` по `subtask_id` (из уже загруженного `order.attachments`).
- [ ] Verify (green): `npm test -- proof-review`.
- [ ] Commit: `git commit -m "feat(proof): getOrder отдаёт subtasks с пруфами"`

### Task 7: Хук приёмки заявки → token + лог + outbox (TDD)
- [ ] В `server/test/proof-review.test.js`: после `acceptSubtask` по ВСЕМ под-задачам — у заявки появляется `public_token`; в `outbox` есть `client_report_ready` с `event_key=report:<id>`; в `client_messages` одна строка; повторная приёмка не плодит дубль токена/события (идемпотентность по `event_key` и not-null token).
- [ ] Verify (red): `npm test -- proof-review`.
- [ ] В `server/src/services/clientMessaging.js` добавить `onOrderAccepted(orderId, { userId, channels='outbox' }, trx)`:
  - если у заявки нет `public_token` — выставить `buildReportToken()`;
  - собрать `body` из активного шаблона «Вывоз выполнен» (или дефолт-строка, если шаблонов нет) через `renderTemplate`;
  - `enqueue(trx, { event_type:'client_report_ready', order_id, payload, event_key:'report:'+orderId })`;
  - вставить строку в `client_messages`.
- [ ] В `server/src/services/proofReview.js` → `maybeAcceptOrder(orderId, trx)`: если все под-задачи заявки `proof_status='accepted'` → перевести заявку `done` (если ещё не) и вызвать `onOrderAccepted`.
- [ ] Verify (green): `npm test -- proof-review`.
- [ ] Commit: `git commit -m "feat(client-msg): хук приёмки — public_token + outbox + лог"`

### Task 8: Роуты проверки пруфов + публичный отчёт (TDD)
- [ ] В `server/test/proof-review.test.js`: `POST /api/subtasks/:id/accept` → 200; `POST /api/subtasks/:id/reject {comment}` → 200; `GET /api/proof-review` → массив очереди; `GET /r/:token` (БЕЗ префикса /api, без авторизации) → 200 и содержит участки; `GET /r/мусор` → 404.
- [ ] Verify (red): `npm test -- proof-review`.
- [ ] Создать `server/src/validators/proofReview.js`: `rejectInput = z.object({ comment: z.string().min(1) }).strict()`.
- [ ] Создать `server/src/routes/proofReview.js` (Router): accept/reject/очередь, `req.auth.user_id` в `userId`.
- [ ] Создать `server/src/routes/publicReport.js` (Router): `GET /r/:token` → `clientMessaging.publicReport(token)`; 404 если нет.
- [ ] Смонтировать: в `server/src/routes/index.js` — `api.use(requireRole('manager','director','superuser'), proofReviewRouter)` (accept/reject/очередь под `/subtasks` и `/proof-review`); в `server/src/app.js` — `app.use(publicReport)` ДО `app.use('/api', api)`.
- [ ] Verify (green): `npm test -- proof-review`.
- [ ] Commit: `git commit -m "feat(proof): роуты accept/reject/очередь + публичный GET /r/:token"`

### Task 9: Бот — показ «возвращено на переделку» в задаче (pull)
- [ ] В `server/src/bot/index.js` (рендер под-задачи в карточке задачи): если `subtask.proof_status === 'rejected'` и `status==='pending'` — добавить строку «⚠ Возвращено на переделку: ${review_comment}». Убедиться, что выборка задач водителя тянет эти поля (`order_subtasks.*`).
- [ ] Verify: запустить бот `cd server; $env:NODE_TLS_REJECT_UNAUTHORIZED=0; node src/bot.js`, отклонить пруф в админке, открыть «Задачи» — видна пометка. (Ручная проверка — у бота нет юнит-тестов.)
- [ ] Commit: `git commit -m "feat(bot): пометка возврата на переделку в задаче водителя"`

### Task 10: Фронт — ProofGallery + модерация в OrderModal
- [ ] Создать `src/components/admin/ProofGallery.jsx`: props `{ subtask, onAccept, onReject }`; рендер вложений (img для photo, video-тег для video, audio для voice, цитата для text); кнопки `✅ Принять` / `↩ Вернуть` (reject открывает prompt/модалку с комментарием); бейдж `proof_status`.
- [ ] В `src/components/admin/OrderModal.jsx`: в блоке участков под каждой под-задачей отрендерить `ProofGallery`; вызовы `api.post('/subtasks/'+id+'/accept')` и `.../reject` с обновлением заявки.
- [ ] Verify: `npm run lint` (из `d:\Татьяна`) — чисто.
- [ ] Commit: `git commit -m "feat(proof): галерея пруфов и модерация в карточке заявки"`

### Task 11: Фронт — страница «Проверка» + стор + меню + роут
- [ ] Создать `src/store/proofReviewStore.js`: `fetchQueue({date,driver_id})` → `GET /proof-review`; `accept(id)`, `reject(id,comment)`.
- [ ] Создать `src/pages/ProofReview.jsx`: фильтры дата/водитель, карточки заявок с `ProofGallery`, кнопка «Принять все в заявке».
- [ ] В `src/App.jsx`: роут `/proof-review` под `ProtectedRoute roles={['manager','director','admin']}`.
- [ ] В `src/components/layout/AppSidebar.jsx`: пункт «Проверка» (`roles: ['manager','director']`).
- [ ] Verify: `npm run lint`.
- [ ] Commit: `git commit -m "feat(proof): страница-очередь Проверка"`

### Task 12: Фронт — ClientMessageModal + кнопки + шаблоны в Settings
- [ ] Создать `src/components/admin/ClientMessageModal.jsx`: props `{ order, client }`; выбор шаблона (из settings `client_message_templates`), превью с подстановками, `navigator.clipboard.writeText(body)` + тост, кнопка-ссылка диплинка `https://t.me/+<phone>` (target=_blank); при отправке — `POST /client-messages` (или существующий лог-эндпоинт) фиксирует `channels='copied'`.
- [ ] Кнопка «✉ Сообщить клиенту» в `OrderModal.jsx` (видна при `status` done/закрыта) и в карточке клиента `src/pages/Clients.jsx`.
- [ ] В `src/pages/Settings.jsx`: секция «Шаблоны сообщений клиенту» — список `{title, body}`, сохранение в `settings` ключ `client_message_templates` (3-4 дефолтных при пустом).
- [ ] Verify: `npm run lint`.
- [ ] Commit: `git commit -m "feat(client-msg): модалка сообщения клиенту + шаблоны в настройках"`

### Task 13: Демо-данные с picsum-пруфами
- [ ] В `server/src/seeds/demo-*.js` (тот, что создаёт выполненные заявки) — для части под-задач вставить `attachments` с `kind='photo'`, `file_url='https://picsum.photos/seed/<n>/600/400'`, `subtask_id` проставлен; одну под-задачу оставить `failed` с `reason_code`/`comment` для демонстрации частичного вывоза.
- [ ] Verify: запустить сид, открыть заявку в админке — галерея показывает картинки; `GET /r/:token` после приёмки показывает их же.
- [ ] Commit: `git commit -m "chore(demo): picsum-пруфы для проверки галереи и публичного отчёта"`

### Task 14: Прогон и финал
- [ ] `cd server; npm test` — все зелёные.
- [ ] `npm run lint` (из `d:\Татьяна`) — чисто.
- [ ] Ручной сценарий: распределить→в работу→бот выполняет с пруфом→в админке принять все участки→появился `public_token`→«Сообщить клиенту» копирует текст и открывает диплинк→`/r/<token>` показывает фотоотчёт. Отдельно: отклонить участок→он вернулся в «Задачи» бота с пометкой.
- [ ] Commit: `git commit -m "test: сквозная проверка пруфов и сообщения клиенту"`

---

## Self-review
- [x] Каждая задача ссылается на конкретные файлы — да.
- [x] Нет placeholder'ов/расплывчатых директив — код миграций и сигнатуры приведены.
- [x] Тесты до реализации — для бэкенда (Vitest+supertest) да; фронт/бот — lint+ручная проверка, т.к. юнит-харнесса для них в репо нет (отмечено явно).
- [x] Команды точные и исполнимые (PowerShell, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `npm test -- <файл>`).

## Заметки по объёму
- Push-уведомление водителю при возврате НЕ делаем (бот не поллит outbox) — выбран pull через `review_comment` в карточке задачи. Если позже понадобится мгновенный push — отдельная задача «outbox-поллер в боте».
- Строгое проксирование `/media` под авторизацию не входит в план (URL = UUID); вынесено на потом, если потребуется.

## Execution Handoff
Дальше — один из путей:
- **superpowers:subagent-driven-development** — свежий субагент на каждую задачу с ревью (рекомендуется для этого объёма).
- **superpowers:executing-plans** — инлайн-исполнение с чекпойнтами.
