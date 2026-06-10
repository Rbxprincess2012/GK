# Водительский Telegram-бот — Implementation Plan

**Goal:** Нативный Telegram-бот водителя: привязка по ссылке, выход на смену с пробегом, свои заявки (изоляция по driver_id), выполнение по участкам с медиа-пруфом, «Завершить заявку» с переносом остатка в пул, завершение смены. Контракт событий для клиентского бота.
**Spec:** [docs/superpowers/specs/2026-06-08-driver-bot-design.md](../specs/2026-06-08-driver-bot-design.md) (v2)
**Tech stack:** Node ESM, Express, Knex, PostgreSQL (Timeweb managed). Бот — grammY (ESM, сессии в Postgres). Тесты — vitest (`server/test/*.test.js`, `resetDb`, прогон `cd server && npx vitest run` — НЕ с фильтром/списком файлов). Миграции — knex, следующая 027. Фронт — React/Vite (`src/`).

> SaaS-замечание: изоляцию и привязку делаем server-side и per-owner; токен бота — через env (на тенант позже). Не вводить глобальных допущений, которые сложно расщепить по тенанту. См. [[saas-future]].

---

## Phase 0 — Проверить ДО старта (ops, без кода)

Эти пункты гейтят реализацию: их результат может поменять детали. Не писать код бота до их закрытия.

- [ ] **Отдельный токен** водительского бота у @BotFather (НЕ тот же, что у клиентского/n8n). Записать в `server/.env` как `DRIVER_BOT_TOKEN=...` (репо публичный — не коммитить).
- [ ] **Исходящие с боевого VPS (217.149.30.139) к `api.telegram.org`**: проверить `getUpdates` (long-polling) и `getFile`/скачивание. Если блокируется — нужен прокси (меняет деплой).
- [ ] **Bot-API МАКС**: есть ли программная отправка/приём фото-видео-голоса, аналог file_id, вебхуки. Зафиксировать факты; если нет — МАКС откладывается, проектируем только Telegram (но Telegram-код держим изолированным).
- [ ] **Полевой тест аплоада** видео/голоса на EDGE/3G в дальнем районе: успех/время/докачка. Если падает — пересмотреть медиа-флоу.
- [ ] Подтвердить, что n8n остаётся ТОЛЬКО на клиентском токене (водительский — целиком нативный бот).

Гейт: пока 1–2 не закрыты, Phase 9 (бот) не начинать. Phases 1–8 (сервер/данные/сервисы) можно делать параллельно — они от Telegram не зависят и тестируются автономно.

---

## Architecture

```
server/src/
  migrations/
    027_driver_pin.js                # drivers.pin_hash, pin_attempts, pin_locked_until
    028_shift_odometer.js            # shifts.odometer_start/end
    029_attachments_media.js         # kind+=video, +subtask_id, +tg_file_id; order_id остаётся
    030_order_subtasks.js            # таблица order_subtasks
    031_bot_sessions.js              # таблица bot_sessions
  services/
    driverAuth.js                    # issueLink (reuse channels.issueCode), bindByCode, setPin, verifyPin (+lockout), resolveDriverByChat, unbind
    driverShift.js                   # goOnShift (upsert present + odometer_start), finishShift (odometer_end)
    driverScope.js                   # ordersForDriver(driverId, {date}), assertOwnership(orderId, driverId)
    subtasks.js                      # syncSubtasks(orderId), markSubtask(...), commitOrderByDriver(...), carryOver(...)
    botSession.js                    # get/set/clear состояние FSM
    mediaStore.js                    # абстракция хранилища: putFromTelegram(fileId)→url (disk impl сейчас)
  bot/
    index.js                         # grammY bootstrap, отдельный процесс, DRIVER_BOT_TOKEN
    session.js                       # Postgres-адаптер сессий grammY (через botSession.js)
    keyboards.js                     # инлайн-клавиатуры
    flows/
      bind.js                        # /start <code> → привязка; PIN re-login
      shift.js                       # выход/завершение смены, пробег
      tasks.js                       # список своих заявок, рендер двухуровневого сообщения + map-link
      complete.js                    # отметка участков, приём медиа, «Завершить заявку»
  bot.js                             # entrypoint: import('./bot/index.js')
server/test/
  driver-auth.test.js, driver-shift.test.js, driver-scope.test.js,
  subtasks.test.js, media-store.test.js, driver-events.test.js
src/pages/Drivers.jsx               # PIN + кнопка «Сгенерировать ссылку» (фронт)
```

Каждый сервис — одна ответственность, без Telegram-специфики (она только в `bot/`). Это и SaaS-задел, и тестируемость.

---

## Tasks

### Task 1 — Миграции данных
- [ ] `server/src/migrations/027_driver_pin.js`: `drivers.pin_hash TEXT NULL`, `drivers.pin_attempts INT NOT NULL DEFAULT 0`, `drivers.pin_locked_until TIMESTAMP NULL`.
- [ ] `028_shift_odometer.js`: `shifts.odometer_start INT NULL`, `shifts.odometer_end INT NULL`.
- [ ] `029_attachments_media.js`: пересоздать CHECK для `kind` с добавлением `'video'` (DO-блок drop+add, как в `024_order_status_failed_fix.js`); `attachments.subtask_id INT NULL REFERENCES order_subtasks(id)` — добавить ПОСЛЕ 030 или в 030; `attachments.tg_file_id TEXT NULL` (кэш). `order_id` оставить NOT NULL.
- [ ] `030_order_subtasks.js`: таблица `order_subtasks(id, order_id FK CASCADE, section_id FK NULL, sub_no INT, status TEXT CHECK in('pending','done','failed') DEFAULT 'pending', reason_code TEXT NULL, comment TEXT NULL, completed_at TIMESTAMP NULL, completed_by_driver_id FK NULL, created_at)`, `unique(order_id, section_id)`, индекс по `order_id`. (Перенести добавление `attachments.subtask_id` сюда, после создания таблицы.)
- [ ] `031_bot_sessions.js`: `bot_sessions(chat_id BIGINT PK, driver_id INT NULL, state TEXT NULL, context JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMP DEFAULT now())`.
- [ ] Verify: `cd server && npm run migrate` → «Batch N run: 5 migrations». Откат-санити: `npm run rollback` затем снова `migrate` (по желанию).
- [ ] Commit: `git commit -m "feat(db): driver pin, shift odometer, subtasks, bot_sessions, attachments media"`

### Task 2 — `services/driverAuth.js` (привязка по ссылке + PIN)
- [ ] Тест `server/test/driver-auth.test.js`: (a) `issueLink(driverId)` создаёт/возвращает `channels` строку с `verify_code` и формирует `t.me/<bot>?start=<code>` (бот-username из env `DRIVER_BOT_USERNAME`); (b) `bindByCode(code, chatId)` привязывает `external_id=chatId`, повторный вызов идемпотентен (`unique(type,external_id)`); (c) `setPin(driverId,'1234')` + `verifyPin(chatId,'1234')` → ok; неверный 5× → `pin_locked_until` в будущем, `verifyPin` → `locked`; (d) `resolveDriverByChat(chatId)` → driverId или null.
- [ ] Verify падает: `cd server && npx vitest run` (новый файл красный).
- [ ] Реализация `driverAuth.js`: `issueLink` поверх `channels.issueCode` (owner_kind='driver'); `bindByCode` поверх `channels.verifyCode`; `setPin` (scrypt из `lib/password.js`), `verifyPin` с лимитом 5 и lockout 15 мин (сброс счётчика при успехе); `resolveDriverByChat` join `channels`.
- [ ] Verify зелёный: `cd server && npx vitest run`.
- [ ] Commit: `git commit -m "feat(driver-auth): link binding + PIN with lockout"`

### Task 3 — Фронт: PIN и ссылка в карточке водителя
- [ ] В `src/pages/Drivers.jsx` (и `src/store/driversStore.js` или где CRUD водителей): поле PIN (set/reset, не показываем хеш) → `PATCH /drivers/:id` с `pin`; кнопка «Сгенерировать ссылку» → `POST /drivers/:id/bot-link` → показать ссылку с «копировать».
- [ ] Бэкенд-роут `POST /drivers/:id/bot-link` → `driverAuth.issueLink`; валидатор `driver.js` принимает `pin` (4–6 цифр) в update.
- [ ] Verify: `cd "d:/Татьяна" && npm run build` зелёный; ручная проверка в админке (сервисы подняты).
- [ ] Commit: `git commit -m "feat(admin): driver PIN + bot invite link"`

### Task 4 — `services/driverShift.js` (смена + пробег поверх present-by-default)
- [ ] Тест `driver-shift.test.js`: `goOnShift(driverId,{date,vehicleId,odometerStart})` делает upsert строки `shifts` (`status='present'`, `shift_type` дефолт `'day'` — ЗАГЛУШКА, не параметр), `vehicle_id`, `odometer_start`; обновляет `vehicles.mileage`. `finishShift(driverId,{date,odometerEnd})` пишет `odometer_end`. Без строки `shifts` (present-by-default) — создаётся новая.
- [ ] Verify падает → реализация (использовать `shifts.upsertShift`) → verify зелёный.
- [ ] Commit: `git commit -m "feat(driver-shift): go on/finish shift with odometer"`

### Task 5 — `services/driverScope.js` (изоляция на сервере)
- [ ] Тест `driver-scope.test.js`: `ordersForDriver(driverId,{date})` отдаёт только заявки этого водителя; `assertOwnership(orderId, driverId)` бросает 403 для чужой. Создать 2 водителей, заявки обоим, проверить, что A не видит заявки B (пусто / 403).
- [ ] Verify падает → реализация (форс-фильтр `assigned_driver_id`, НЕ доверять входному параметру) → verify зелёный.
- [ ] Commit: `git commit -m "feat(driver-scope): server-side driver isolation"`

### Task 6 — `services/subtasks.js` (материализация + выполнение + перенос)
- [ ] Тест `subtasks.test.js`:
  - `syncSubtasks(orderId)` создаёт по одной строке на участок среди `order_items` (или одну `section_id=null`), стабильный `sub_no`; повторный вызов не плодит дубли.
  - `markSubtask(subtaskId,{status:'done', proof})` / `{status:'failed', reason_code, comment}`.
  - `commitOrderByDriver(orderId, driverId)`: все done → заявка `done`; часть не-done → заявка возвращается в пул (`status='new'`, `assigned_driver_id=null`, `shift_*=null`), done-подзадачи остаются закрытыми; идемпотентность повторного коммита; поздний апдейт от старого водителя после переназначения отбрасывается (`assert assigned_driver_id`).
  - Заявка без участков → одна подзадача; happy path == старый `done`.
- [ ] Реализация: вызвать `syncSubtasks` из `createOrder`/`updateOrder` (`orders.js`) при сохранении позиций. **Заменить** существующие `driverConfirm`/`fail` (`orders.js:~280-301`) на подзадачную модель; обновить/мигрировать тесты `orders-stage2`, `orders-complete`.
- [ ] Verify: полный прогон `cd server && npx vitest run` (регресс старых заявок зелёный).
- [ ] Commit: `git commit -m "feat(subtasks): per-section execution, commit, carry-over to pool"`

### Task 7 — `services/mediaStore.js` (своё хранилище, в фоне)
- [ ] Тест `media-store.test.js`: `putFromTelegram(fileId)` (Telegram getFile замокать) скачивает и кладёт в каталог `MEDIA_DIR`, возвращает URL; ошибка сети не роняет вызывающего (ретрай/очередь). Абстракция: интерфейс `put(buffer,ext)→url`, disk-реализация сейчас; S3 — позже (SaaS).
- [ ] Реализация: disk-хранилище под `MEDIA_DIR` (volume на VPS); фоновая обработка (простая очередь/таблица или setImmediate-ретрай) — коммит заявки НЕ блокируется скачиванием; `attachments.file_url` пишется по факту, `tg_file_id` — сразу как кэш.
- [ ] Commit: `git commit -m "feat(media): own storage with background fetch from Telegram"`

### Task 8 — Контракт событий outbox (для клиентского бота)
- [ ] Тест `driver-events.test.js`: при `commitOrderByDriver` пишется outbox-событие с результатами по участкам (✅/перенос + ссылки на пруф); имена событий СОГЛАСОВАНЫ с существующими (`order_assigned` уже пишется в `assign`, `orders.js:146`) — не плодить параллельный словарь. Назначение заявки шлёт анонс-событие (переиспользовать `order_assigned`).
- [ ] Реализация: `outbox.enqueue` в `commitOrderByDriver`; задокументировать список событий в спеке (раздел контракта). Получатель (клиентский бот) — НЕ в этом плане.
- [ ] Commit: `git commit -m "feat(events): driver commit emits client-facing outbox events"`

### Task 9 — Бот (grammY), отдельный процесс — ТОЛЬКО после Phase 0
- [ ] `npm i grammy` в `server/`. `server/src/bot.js` (entry) + `server/src/bot/index.js`: grammY на `DRIVER_BOT_TOKEN`, long-polling, single-instance.
- [ ] `bot/session.js`: адаптер сессий grammY поверх `services/botSession.js` (Postgres) — состояние переживает рестарт.
- [ ] `bot/flows/bind.js`: `/start <code>` → `driverAuth.bindByCode` → главное меню; непривязанный без кода, но был ранее → запрос PIN (`verifyPin`); «Выйти» → `unbind`. Никаких списков водителей.
- [ ] `bot/flows/shift.js`: «Вышел на смену» → подтверждение машины (`default_vehicle_id`, сменить) → запрос пробега → `goOnShift`. «Завершить смену» → пробег → `finishShift`. «Задачи на завтра» (read-only).
- [ ] `bot/flows/tasks.js`: «Мои задачи» → `driverScope.ordersForDriver(self, today)` по `seq`; рендер сообщения: **шапка с кликабельным адресом** (`yandexMapsUrl`-эквивалент: `https://yandex.ru/maps/?ll={lng},{lat}&z=17&pt={lng},{lat}`), **уровень 1** участки текстом, **уровень 2** `📦 С базы взять: 📦×N`, мелко «N рейсов».
- [ ] `bot/flows/complete.js`: по участку ✅/⚠️; приём фото/видео/голоса (нативно) → `mediaStore.putFromTelegram`; для ⚠️ обязательна причина (пресет-кнопки). «Завершить заявку» → переспрос при незакрытых → `subtasks.commitOrderByDriver` → заявка для водителя заблокирована.
- [ ] Все запросы данных идут через `driverScope` (изоляция). Telegram-специфика не утекает в `services/*`.
- [ ] Verify: ручной прогон в тестовом боте (отдельный токен): привязка по ссылке, смена, задача, закрытие участка с фото, коммит, перенос остатка появляется в админ-пуле с фильтром «Переносы».
- [ ] Commit: `git commit -m "feat(bot): driver bot flows (bind, shift, tasks, complete)"`

### Task 10 — Деплой
- [ ] Бот — отдельный процесс в docker compose (или pm2) рядом с API; env `DRIVER_BOT_TOKEN`, `DRIVER_BOT_USERNAME`, `MEDIA_DIR` (volume). Long-polling, single-instance.
- [ ] README/деплой-заметка: как поднять бота, где volume медиа.
- [ ] Commit: `git commit -m "chore(deploy): driver bot process + media volume"`

---

## Self-review checklist
- [x] Каждая задача ссылается на конкретные файлы/пути.
- [x] Нет placeholder'ов — указаны сигнатуры, миграции, команды.
- [x] Тесты пишутся до реализации (Tasks 2,4,5,6,7,8).
- [x] Команды точные: `cd server && npm run migrate`, `cd server && npx vitest run`, `cd "d:/Татьяна" && npm run build`.
- [x] Гейт Phase 0 явный; бот (Task 9) не стартует до проверки токена/сети.
- [ ] (ручное) Подтвердить выбор grammY vs Telegraf перед Task 9.

## Замечания по разбиению
Tasks 1–8 (сервер/данные/сервисы) — автономны от Telegram, тестируются полностью через vitest. Task 9 (бот) зависит от 1–8 и от Phase 0. Если захочется — Task 9–10 можно вынести в отдельный план-файл после закрытия Phase 0, но интерфейс (сервисы) уже зафиксирован здесь.

## Execution handoff
Два пути запуска реализации:
- **superpowers:subagent-driven-development** — свежий субагент на каждую задачу с ревью (рекомендую для server-задач 1–8: чистый TDD-цикл).
- **superpowers:executing-plans** — инлайн-исполнение с чекпойнтами (удобно для Task 9–10, где много ручной проверки бота).
