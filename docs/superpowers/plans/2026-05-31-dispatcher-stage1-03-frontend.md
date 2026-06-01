# Этап 1 · План 03 — Фронтенд (api.js + экраны)

**Goal:** Перевести существующий React-фронт со сторов-моков на реальный бэкенд (`api.js`),
добавить экраны: Объекты, Контейнеры, Машины, Календарь смен, борд «Распределение»;
довести цикл заявки (создание с опц. номерами контейнеров → назначение → закрытие у
водителя → отправка заказчику).
**Spec:** [docs/superpowers/specs/2026-05-31-dispatcher-core-design.md](../specs/2026-05-31-dispatcher-core-design.md)
**Предусловие:** выполнены Планы 01–02 (бэкенд поднят, API работает).
**Tech stack:** React 19 + Vite, Zustand, shadcn/ui, motion/react, axios (`src/lib/api.js`).

> Существующие экраны: Dashboard, Orders, Drivers, Clients, Schedule, Users.
> Новые: Objects, Containers, Vehicles, Distribution; Schedule превращается в Календарь.

---

## Architecture

```
src/
  lib/api.js                 # уже есть (axios + VITE_API_URL) — не меняем интерфейс
  store/                     # действия моков -> вызовы api; добавить loading/error
    clientsStore.js  objectsStore.js  containersStore.js  vehiclesStore.js
    driversStore.js  ordersStore.js   shiftsStore.js      refsStore.js (districts/streets)
  pages/
    Clients.jsx              # + реквизиты/оплата/email/requires_photo, вложенные объекты
    Objects.jsx (new)        # карточка объекта + инвентарь
    Containers.jsx (new)     # реестр контейнеров
    Vehicles.jsx (new)       # реестр машин
    Schedule.jsx -> Calendar # подробный календарь смен (план/факт)
    Distribution.jsx (new)   # борд распределения
    Orders.jsx               # создание (с опц. номерами) / назначение / закрытие
  components/
    orders/CompleteDialog.jsx (new)   # ввод фактических номеров + вложения
    orders/RequestedContainers.jsx (new) # выбор конкретных лодочек из инвентаря
```

Принцип: каждый стор — тонкая обёртка над `api.*` с `loading`/`error`; компоненты
вызывают действия и читают данные из сторов (как сейчас, но данные приходят с сервера).

---

## Tasks

### Task 0: Выпилить прототип n8n и переключить окружение

- [ ] Шаг 1: Удалить устаревший прототип: `n8n/orders-api.workflow.json`,
  `n8n/schema.sql` (схему ведёт бэкенд миграциями). Каталог `n8n/` оставить пустым/под
  будущие воркфлоу Этапа 2.
- [ ] Шаг 2: В корневом `.env` заменить значение на адрес бэкенда:
  `VITE_API_URL=http://localhost:3000/api`
- [ ] Шаг 3: Verify: `npm run dev -- --port 5174` стартует без ошибок; в консоли сети
  запросы идут на `:3000/api`.
- [ ] Commit: `chore(front): point API to express backend, drop n8n prototype`

### Task 1: refsStore — справочники районов/улиц (TDD-lite)

- [ ] Шаг 1: Создать `src/store/refsStore.js`: `fetchDistricts()`,
  `searchStreets(q)` → `api.get('/streets', { params: { q } })`.
- [ ] Шаг 2: Тест `src/store/refsStore.test.js` (Vitest + mock axios): `searchStreets`
  кладёт результат в стор.
- [ ] Шаг 3: Verify: `npm test -- refsStore`
- [ ] Commit: `feat(front): refs store (districts/streets)`

### Task 2: clientsStore + Clients/Objects на API

- [ ] Шаг 1: Переписать `src/store/clientsStore.js`: `fetchClients`, `addClient`,
  `updateClient`, `removeClient`, `fetchObjects(clientId)`, `addObject`, `updateObject`
  через `api.*`; убрать мок-сид.
- [ ] Шаг 2: Создать `src/store/objectsStore.js`: `fetchObject(id)`,
  `fetchInventory(id)` → `GET /objects/:id/inventory`.
- [ ] Шаг 3: Обновить `src/pages/Clients.jsx`: форма заказчика с полями реквизитов
  (`type` ООО/ИП — у ИП скрыть КПП), `nickname`, `email`, `default_payment_method`,
  `requires_photo`; вложенный список **объектов** с выбором улицы (автоподстановка
  района из `refsStore`), домом, неоф. названием.
- [ ] Шаг 4: `useEffect(fetchClients)` на маунте; форма ждёт ответа API.
- [ ] Шаг 5: Verify: вручную — создать заказчика и объект, район подставился из улицы.
- [ ] Commit: `feat(front): clients & objects on API`

### Task 3: Экран Объекты + инвентарь

- [ ] Шаг 1: Создать `src/pages/Objects.jsx`: список объектов (фильтр по заказчику/
  району), карточка объекта с **текущим инвентарём** (контейнеры из
  `objectsStore.fetchInventory`).
- [ ] Шаг 2: Добавить роут `/objects` в `src/App.jsx` (guard как у прочих рабочих
  экранов) и пункт в `src/components/layout/AppSidebar.jsx`.
- [ ] Шаг 3: Verify: на объекте с контейнерами инвентарь отображается; на пустом — «пусто».
- [ ] Commit: `feat(front): objects page with live inventory`

### Task 4: Контейнеры и Машины (реестры)

- [ ] Шаг 1: `src/store/containersStore.js` + `src/pages/Containers.jsx`: таблица
  (номер, тип, состояние, местоположение/объект), создание/редактирование.
- [ ] Шаг 2: `src/store/vehiclesStore.js` + `src/pages/Vehicles.jsx`: таблица
  (госномер, ёмкость, норма топлива, статус, водитель по умолч.), CRUD.
- [ ] Шаг 3: Роуты `/containers`, `/vehicles` + пункты сайдбара.
- [ ] Шаг 4: Verify: создать машину с дублирующим госномером → ошибка от API показана.
- [ ] Commit: `feat(front): containers & vehicles registries`

### Task 5: Календарь смен (план/факт)

- [ ] Шаг 1: `src/store/shiftsStore.js`: `fetchRange(from,to)` → `GET /shifts`,
  `upsertShift(payload)` → `PUT /shifts`, `fetchAvailable(date,shift_type)`.
- [ ] Шаг 2: Переработать `src/pages/Schedule.jsx` в **подробный календарь**: сетка
  месяц/неделя, строки — водители, ячейки — статус смены (вышел/болеет/отпуск, день/ночь)
  + назначенная машина; клик по ячейке меняет статус (`upsertShift`).
- [ ] Шаг 3: Цветовая легенда статусов; навигация по неделям/месяцам.
- [ ] Шаг 4: Verify: пометить водителя `sick` — ячейка перекрашивается, сохраняется на API.
- [ ] Commit: `feat(front): detailed shift calendar (plan/fact)`

### Task 6: Создание заявки + выбор конкретных контейнеров

- [ ] Шаг 1: Создать `src/components/orders/RequestedContainers.jsx`: для позиции с
  действием `replace`/`haul` — опц. мультивыбор **конкретных лодочек из инвентаря
  объекта** (когда заказчик назвал номера). По умолчанию пусто = «любые».
- [ ] Шаг 2: Обновить форму в `src/pages/Orders.jsx`: позиция = `действие × тип ×
  кол-во`; при `replace`/`haul` показать `RequestedContainers` (тянет инвентарь объекта
  из `objectsStore`); в payload класть `requested_container_ids` при выборе.
- [ ] Шаг 3: `ordersStore.addOrder` шлёт `object_id`, `items[]`
  (с `requested_container_ids?`), `payment_method?`, `note`.
- [ ] Шаг 4: Verify: создать заявку «забрать конкретную лодочку №…» — она в payload и в
  карточке заявки видна как запрошенная.
- [ ] Commit: `feat(front): order create with optional requested containers`

### Task 7: Борд «Распределение»

- [ ] Шаг 1: Создать `src/pages/Distribution.jsx`: слева — нераспределённые заявки
  (`GET /orders?status=new`), **сгруппированы по району**; справа — доступные сегодня
  водители (`shiftsStore.fetchAvailable`) с машиной и счётчиком загрузки/слотов.
- [ ] Шаг 2: Назначение: кнопка/дроп на водителя → `ordersStore.assign(orderId,
  {driver_id, shift_date, shift_type, vehicle_id})`; счётчик слотов обновляется,
  превышение ёмкости (3) подсвечивается.
- [ ] Шаг 3: Роут `/distribution` + пункт сайдбара; сделать стартовым рабочим экраном.
- [ ] Шаг 4: Verify: заявки сгруппированы по району; назначение на `present`-водителя
  переносит заявку и увеличивает его счётчик; назначить на отсутствующего нельзя.
- [ ] Commit: `feat(front): distribution board (by district, balanced load)`

### Task 8: Закрытие у водителя + отправка заказчику

- [ ] Шаг 1: Создать `src/components/orders/CompleteDialog.jsx`: ввод **фактических
  движений** — по каждой позиции выбрать контейнеры и направление (delivered/picked_up);
  если в заявке были `requested_container_ids` — предзаполнить ими; + вложения
  (фото-URL/текст/расшифровка, опц.).
- [ ] Шаг 2: `ordersStore.complete(id, { movements, attachments })` →
  `POST /orders/:id/complete`; после успеха инвентарь объекта пересчитан на сервере.
- [ ] Шаг 3: Кнопка «Отправлено заказчику» → `ordersStore.close(id)` →
  `POST /orders/:id/close`; статус `закрыта`.
- [ ] Шаг 4: Обновить статусную модель в `Orders.jsx`/`Dashboard.jsx` на
  `new|assigned|in_progress|done|closed|cancelled` (привести лейблы/цвета;
  заменить прежние `in_transit`/`completed`).
- [ ] Шаг 5: Verify: закрыть заявку с движениями → статус `done`, инвентарь изменился;
  «Отправлено» → `done`→`closed`.
- [ ] Commit: `feat(front): driver completion (movements+attachments) and close`

### Task 9: Дашборд и сквозная проверка

- [ ] Шаг 1: Обновить `src/pages/Dashboard.jsx` под новые статусы/сущности
  (счётчики: новые, в работе, выполнено сегодня, водителей на смене из `shiftsStore`).
- [ ] Шаг 2: Сквозной ручной сценарий: заказчик→объект→заявка (с конкретной лодочкой)→
  распределение→закрытие→отправка; проверить инвентарь объекта до/после.
- [ ] Шаг 3: `npm run lint` — без новых ошибок; `npm run build` — успешно.
- [ ] Commit: `feat(front): dashboard on new model + end-to-end pass`

---

## Self-review checklist

- [x] Каждая задача — конкретные файлы (`src/store/*`, `src/pages/*`, `src/components/*`).
- [x] Нет placeholder'ов: указаны эндпоинты, payload'ы, действия сторов.
- [x] Проверки после каждой задачи (ручные сценарии + lint/build).
- [x] Учтён кейс «конкретные номера от заказчика» (`RequestedContainers` + `complete`).

## Execution Handoff

Все три плана (`…-01`, `…-02`, `…-03`) выполнять по порядку. Рекомендуемый способ запуска:

- **superpowers:subagent-driven-development** — свежий субагент на каждую задачу с ревью
  (рекомендуется для объёма Этапа 1).
- **superpowers:executing-plans** — инлайн-исполнение с чекпойнтами.
