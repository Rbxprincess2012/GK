# MAX-боты: полный паритет с Telegram — Implementation Plan

**Goal:** Перенести оба Telegram-бота на мессенджер **MAX** с полным паритетом:
1. **Уведомительный контур** — онбординг доверенных лиц и получателей отчётов через MAX
   (deep-link `bot_started` + payload), авто-доставка отчётов о выполнении заявок в MAX.
2. **Водительский контур** — порт водительского бота на MAX (привязка по ссылке, смена с
   пробегом, «Мои задачи», карточка заявки, отметка участков ✅/⚠️, фото/видео/голос-пруф,
   «Завершить заявку» → коммит/перенос).

Бизнес-логика (сервисы) — общая с Telegram, channel-agnostic. MAX-специфика изолируется в
транспортном слое и в presentation-адаптере. Telegram-контур не трогаем (работает).

**Связанные памяти:** [[max-bot-api-spec]], [[max-bot-later]], [[driver-bot-spec]],
[[resume-2026-06-12]], [[deploy-prod]], [[stage2-roadmap]].

**Tech stack:** Node ESM, Express, Knex, PostgreSQL (Timeweb managed, общая dev/прод).
MAX Bot API = форк TamTam (`https://platform-api.max.ru`, заголовок `Authorization: <token>`,
30 rps). Тесты — vitest+supertest (`cd server && npx vitest run`). Миграции knex, следующая
**045**. Фронт — React/Vite (`src/`). Деплой — push в `main` → CI → ветка `deploy` → cron на
проде (api+bot+clientbot+web). Деплою сам по SSH-ключу `~/.ssh/putevo_deploy`.

> SaaS: токен MAX и адреса — per-owner; глобальных допущений не вводим. См. [[saas-future]].

---

## ⚠️ Открытые решения (подтвердить до/во время Phase 0)

### D1. Сколько MAX-ботов? — **РЕШЕНО ЗАКАЗЧИКОМ: ДВА** (точное зеркало Telegram)
Делаем ДВА отдельных MAX-бота, как в Telegram: **водительский** и **клиентский**, у каждого свой
токен и свой long-poll. Это упрощает изоляцию (нет смешивания driver-флоу и онбординга в одном
процессе — снимает V1/V2). **Требуется ДВА токена MAX** (`max_driver_bot_token`,
`max_client_bot_token`). ⚠️ Заказчик внёс пока ОДИН `max_bot_token` — нужен второй; и определить,
какой из внесённых токенов чей. Роли/payload — ровно как в Telegram, только через `bot_started`:
| Роль | Telegram | MAX |
|---|---|---|
| Водитель | driver-бот `/start <code>` | driver-бот, `bot_started` payload `<code>` |
| Получатель-лицо (dm) | client-бот `/start <code>` | client-бот, payload `<code>` |
| Доверенное лицо | client-бот `/start p<code>` | client-бот, payload `p<code>` |
| Группа-получатель | client-бот `/bind <code>` | client-бот, команда `/bind <code>` в группе |
Префикс `p` различает лицо vs получателя ВНУТРИ клиентского бота (как сейчас в `clientBot.js`).

### D2. MAX deep-link URL — ✅ ВЕРИФИЦИРОВАНО (ревью 2026-06-14)
Верно: **`https://max.ru/<botName>?start=<payload>`** (НЕ `/start/<payload>` как в TamTam).
payload ≤128 символов. Бот получает `bot_started` с `payload` на верхнем уровне.

### D3. JSON-схемы апдейтов/сообщений MAX — ✅ ВЕРИФИЦИРОВАНО (OpenAPI TamTam + доки MAX)
- `message_created`: текст → **`message.body.text`**; отправитель → **`message.sender.user_id`**;
  адресат → **`message.recipient.chat_id`** (+ `chat_type`, `recipient.user_id`);
  вложения → **`message.body.attachments[]`** (дискриминатор `type`); `mid`→`message.body.mid`.
- `message_callback`: **`callback.callback_id`**, **`callback.payload`**, **`callback.user.user_id`**;
  текущее сообщение в `message`.
- `bot_started`: **`chat_id`** и **`payload`** — ПЛОСКИЕ поля верхнего уровня (НЕ внутри message!),
  `user.user_id`.
- **Адресация `POST /messages` — через QUERY**, не в теле: `?user_id=<id>` (личка) или
  `?chat_id=<id>` (чат). Тело — `{text, format:'markdown'|'html', attachments, notify}`.
- callback-ответ: **`POST /answers?callback_id=<id>`** тело `{message?, notification?}`.
- edit/delete: **`PUT|DELETE /messages?message_id=<mid>`**.
- long-poll: `GET /updates?limit&timeout(0..90,def30)&marker&types`; marker из ответа → в след. запрос.
- inline_keyboard: `{type:'inline_keyboard', payload:{buttons:[[{type:'callback',text,payload}]]}}`.

### D4. Скачивание медиа из MAX — ✅ ВЕРИФИЦИРОВАНО
- **Фото/файл/аудио:** URL уже в апдейте — **`attachments[].payload.url`** (качать с заголовком
  `Authorization`). Аналога `getFile` не нужно. ⚠️ Фото имеет **`type:"image"`** (не `"photo"`).
- **Видео:** `attachments[].payload.token` → **`GET /videos/{videoToken}`** → `urls` (mp4) → скачать.
- `payload.token` у медиа — для ПЕРЕИСПОЛЬЗОВАНИЯ вложения, не для скачивания (кроме видео-token).

---

## Phase 0 — Верификация MAX API  ✅ выполнено ревью 2026-06-14 (см. D2–D4)

- [x] Поля `bot_started`/`message_created`/`message_callback`, адресация `POST /messages` (query
      `?user_id=`/`?chat_id=`), `inline_keyboard` — сверены с OpenAPI TamTam + доки MAX → D3.
- [x] Deep-link `https://max.ru/<bot>?start=<payload>`, payload ≤128 → D2.
- [x] Медиа: фото/файл/аудио `payload.url` (фото `type:"image"`); видео `GET /videos/{token}` → D4.
- [x] Base URL `platform-api.max.ru` (НЕ legacy `botapi.max.ru`); заголовок `Authorization: <token>`.
- [ ] **Живой дым (с прод-VPS, заказчиков токен):** `GET /me` отдаёт `username`? исходящие на
      `platform-api.max.ru` проходят из РФ? — единственное, что осталось проверить на сервере.

---

## Architecture

```
server/src/lib/maxApi.js        ← низкоуровневый HTTP-клиент MAX (fetch, Authorization-header)
server/src/lib/maxgram.js       ← мини-framework «как grammY» поверх maxApi:
                                   Bot / InlineKeyboard / session, маппинг update→ctx
server/src/bot/maxDriverBot.js  ← водительский MAX-бот (зеркало bot/index.js на maxgram)
server/src/bot/maxClientBot.js  ← клиентский MAX-бот, онбординг (зеркало bot/clientBot.js)
server/src/maxBot.js            ← entrypoint driver-процесса (как bot.js)
server/src/maxClientBot.js      ← entrypoint client-процесса (как clientBot.js)
server/src/services/clientDelivery.js (ветка maxSend) ← поверх maxApi
server/src/services/mediaStore.js (putFromMax) ← скачивание медиа из MAX
```
Сессии (`bot_sessions`) использует ТОЛЬКО водительский бот (клиентский — stateless онбординг,
как в Telegram). Но channel-namespace всё равно нужен: driver-MAX-сессии не должны коллизить с
driver-TG-сессиями по числовому chat_id (B1, Task 1b).
Расширяем (channel-aware), НЕ дублируем сервисы:
- `channels.js` — параметризовать `type` (уже enum `telegram|max`); driverAuth получает MAX-варианты.
- `trustedPersonChannels.js` — MAX-онбординг (`max_chat_id/max_status/max_verify_*`).
- `clientRecipients.js` — колонка `channel`; bind/issue с каналом.
- `clientDelivery.js` — `sendReportToClient` диспетчеризует target по `channel` → tgSend|maxSend.
- `botConfig.js` — `getMaxBotToken()`, `getMaxBotUsername()`.

---

## Tasks

### Task 1 — Миграция 045: MAX-каналы + namespace сессий  ⚠️ доработано по ревью
- [ ] `trusted_persons`: `max_chat_id bigint`, `max_status text`, `max_verify_code text`,
      `max_verify_expires_at timestamp` (зеркало `tg_*` из 041).
- [ ] `client_recipients`: `channel text notNullable default 'telegram'`. **B3:** именованный
      constraint `client_recipients_chat_id_unique` снять `dropUnique(['chat_id'])`, добавить
      `unique(['channel','chat_id'])`. `down` — восстановить ровно `unique(['chat_id'])`.
- [ ] `bot_sessions`: добавить `channel text notNullable default 'telegram'`. **B1:** текущий PK
      (мигр. 031) — ОДИНОЧНЫЙ `chat_id`. Сменить на составной `(channel, chat_id)`:
      `dropPrimary()` → `primary(['channel','chat_id'])`. БЕЗ этого MAX-сессия затрёт TG.
- [ ] `down` — обратимо (вернуть одиночный PK `chat_id`, убрать `channel`).

### Task 1b — Переписать `botSession.js` + `sessionStore.js` под канал  ⚠️ B1 (новый, обязателен)
- [ ] `services/botSession.js`: `readSession(channel, chatId)`, `writeSession(channel, chatId, value)`,
      `deleteSession(channel, chatId)` — фильтр/`onConflict(['channel','chat_id'])` (иначе
      `ON CONFLICT` упадёт «no matching constraint» и сломает ПРОД-TG).
- [ ] `bot/sessionStore.js`: сделать фабрику `pgStorageFor(channel)` — адаптер несёт канал в
      замыкании, ключ остаётся chat_id. TG-бот (`bot/index.js`, `bot/clientBot.js`) переводим на
      `pgStorageFor('telegram')`; MAX — `pgStorageFor('max')`.
- [ ] Регресс: существующие тесты сессий/ботов зелёные (TG-поведение не изменилось).

### Task 2 — `lib/maxApi.js` (транспорт)
- [ ] Класс `MaxApi(token, { fetchImpl, baseUrl })`. Методы: `call(method, path, {query,body})`
      с заголовком `Authorization: <token>`; `getMe()`, `sendMessage({chatId,text,format,attachments})`,
      `editMessage(mid,...)`, `deleteMessage(mid)`, `answerCallback(callbackId,...)`,
      `getUpdates({marker,timeout,types})`, `downloadAttachment(...)` (по D4).
- [ ] Ретраи на 429/503, уважение 30 rps. fetchImpl инъектируется (тесты).
- [ ] Юнит-тесты на shaping запросов (заголовок, query, body) с поддельным fetch.

### Task 3 — `lib/maxgram.js` (framework «как grammY»)
- [ ] `Bot(token)`: `.command(name,h)`, `.on('callback_query:data',h)`, `.on('message',h)`,
      `.use(session(...))`, `.catch(h)`, `.start({onStart})` (long-poll loop с marker), `.api`.
- [ ] `InlineKeyboard`: `.text(label,payload)`, `.row()` → MAX `attachments:[{type:'inline_keyboard',
      payload:{buttons:[[...]]}}]` (callback-кнопки).
- [ ] `session({initial,storage,getSessionKey})` — поверх `botSession` с `channel='max'`.
- [ ] ctx: `.chat.id`, `.from`, `.match` (payload после префикса/команды), `.msg`/`.message`
      (нормализованные text/photo/video/voice + attachment-id), `.callbackQuery.data`,
      `.reply(text,opts)`, `.answerCallbackQuery()`. Маппинг по верифицированным в Phase 0 полям.
- [ ] Тесты: фикстуры апдейтов MAX → проверка нормализации ctx и сборки клавиатуры.

### Task 4 — channel-aware онбординг (сервисы)  ⚠️ V3/V4
- [ ] **Совместимость (V3):** новый аргумент канала — строго ПОСЛЕДНИЙ опциональный, дефолт
      `'telegram'` (тесты вызывают позиционно: `bindByCode(code, 555001)`, `issueInvite(id,'dm')`,
      `issueLink(id)`). Иначе регресс.
- [ ] `driverAuth.js`: параметризовать `type` в `issueLink`, `bindByCode`, `resolveDriverByChat`,
      `unbind` (сейчас хардкод `type:'telegram'`). `channels.issueCode/verifyCode/resolve` — дефолты ок.
- [ ] `trustedPersonChannels.js` **(V4 — это ветвление КОЛОНОК `${ch}_*`, не проброс):**
      `issuePersonInvite/bindPersonByCode/revokePersonChannel` выбирают набор `tg_*` vs `max_*` по
      каналу; `activePersonsForObject` возвращает ОБА канала (для Task 6 разворота в 0..2 target).
- [ ] `clientRecipients.js`: `issueInvite(clientId, kind, channel?)`, `bindByCode(code, {chat_id,
      kind, title, channel})` — писать `channel`; `revoke` канал берёт из строки.

### Task 5a — `bot/maxDriverBot.js` (водительский MAX-бот)
- [ ] Зеркало `bot/index.js` на maxgram + presentation MAX (`format:'markdown'`/'html' по D3
      вместо `parse_mode:'HTML'`; ссылки/телефоны в MAX-разметке; nav-кнопки — как в Telegram,
      теперь per-bot без конфликта, V1/V2 сняты двумя ботами).
- [ ] `bot_started` payload `<code>` → `bindByCode(code, chatId, 'max')`; иначе резолв по chat_id.
- [ ] Сессии через `pgStorageFor('max')` (Task 1b). Медиа-пруф через `putFromMax` (Task 8).
- [ ] `maxBot.js` entrypoint: `getMaxDriverBotToken()`, `start({onStart})` → `max_driver_bot_username`.
- [ ] `npm run max-bot` + `max-bot:dev` в `server/package.json`.

### Task 5b — `bot/maxClientBot.js` (клиентский MAX-бот)
- [ ] Зеркало `bot/clientBot.js` на maxgram (stateless). `bot_started` payload: `p<code>` →
      `bindPersonByCode(code,{chat_id,channel:'max'})`; иначе `<code>` → `bindByCode` (recipient
      kind 'dm', channel 'max'). Команда `/bind <code>` в группе → recipient kind 'group'.
- [ ] `maxClientBot.js` entrypoint: `getMaxClientBotToken()`, `start({onStart})` →
      `max_client_bot_username`. `npm run max-client-bot` в `server/package.json`.

### Task 6 — Доставка отчётов (channel dispatch)  ⚠️ B2
- [ ] `clientDelivery.js`: `sendReportToClient` строит targets, КАЖДЫЙ несёт `channel`:
      - client_recipients → `channel` из строки (Task 1);
      - **person → развернуть в 0..2 target** (tg, если `tg_status='active'`; max, если
        `max_status='active'`) — НЕ один target с `tg_chat_id` (текущий код так делает — переписать).
- [ ] Диспетчер по `channel`: `tgSend` | `maxSend` (новый, поверх maxApi, адресация `?user_id=`).
- [ ] Revoke по 403/400 бьёт колонку СВОЕГО канала: person → `${channel}_status`; recipient →
      `status` (канал в строке). Не ревокать чужой канал лица.
- [ ] **M3:** outbox-событие `client_report_ready` (n8n) остаётся TG-only — MAX-доставка идёт
      ТОЛЬКО через `sendReportToClient`. Зафиксировать, n8n-ветку MAX не вводим сейчас.
- [ ] Юнит-тест: смешанные получатели (tg+max, лицо с двумя каналами) → правильный диспатч и
      раздельный revoke; инъекция sendImpl.

### Task 7 — Роуты + botConfig  (ДВА токена/username)
- [ ] `routes/settings.js` zod `tokensInput`: заменить одиночный `max_bot_token` на
      **`max_driver_bot_token`** + **`max_client_bot_token`** (`.passthrough()` стерпит миграцию).
- [ ] `botConfig.js`: `getMaxDriverBotToken()`/`getMaxClientBotToken()` (Настройки → .env фолбэк),
      `getMaxDriverBotUsername()`/`getMaxClientBotUsername()` (Настройки `max_driver_bot_username`/
      `max_client_bot_username` → MAX `getMe` → .env). **V5: отдельные кеш-переменные** на каждого.
- [ ] Хелпер MAX deep-link: **`https://max.ru/${username}?start=${payload}`** (D2). Водитель —
      payload `<code>` (driver-username); лицо — `p<code>`, получатель — `<code>` (client-username).
- [ ] `routes/index.js`: `POST /drivers/:id/bot-link?channel=max` → MAX driver deep-link.
- [ ] `routes/trustedPersons.js`: `POST /:id/invite?channel=max` (`p<code>`, client-username) и
      `/revoke?channel=max`.
- [ ] `routes/clientRecipients.js`: `dm`/`group` принимают канал, отдают MAX ссылку/`/bind`.
- [ ] `config.js`: добавить `MAX_DRIVER_BOT_TOKEN/USERNAME`, `MAX_CLIENT_BOT_TOKEN/USERNAME` в zod.

### Task 8 — Медиа из MAX
- [ ] `mediaStore.js`: `putFromMax(attachmentRef, {token})` по D4 → `put(buffer, ext)`.
      Вызов в фоне (как `putFromTelegram`), коммит не блокируем.

### Task 9 — Админка (включить MAX-карточки)
- [ ] `TrustedPersonChannels.jsx`: MAX-карточка — снять `disabled`, кнопка «Пригласить» →
      `invitePerson(personId,'max')` → MAX deep-link; badge active/pending по `max_status`;
      revoke MAX-канала. Бейдж «скоро» убрать. **M5: проп `maxStatus` сейчас НЕ передаётся** —
      добавить его (и проброс из родителя, рядом с `tgStatus`).
- [ ] `clientsStore.js`: `invitePerson(id, channel='telegram')`/`revokePerson(id, channel)` —
      добавить аргумент канала (сейчас только `id`).
- [ ] `ClientRecipients.jsx`: переключатель/доп-кнопки канала (Telegram|MAX) для dm/group;
      **M5: заголовок «Telegram-получатели» хардкод** — обобщить; иконка канала у строки.
- [ ] `Settings.jsx`: сейчас одно поле `max_bot_token` — заменить на ДВА (`max_driver_bot_token`,
      `max_client_bot_token`), рядом с двумя telegram-полями.
- [ ] `PhoneMessengerField.jsx`: `MaxIcon` уже есть — переиспользовать.

### Task 10 — Деплой  (ДВА сервиса)
- [ ] `docker-compose.prod.yml`: сервисы `maxbot` (`npm run max-bot`) и `maxclientbot`
      (`npm run max-client-bot`) — образ `dispatcher-api`, `depends_on: api`, БЕЗ IPv4-пина Telegram
      (MAX это РФ-хост). `maxbot` монтирует `media_data` (медиа-пруф водителя).
- [ ] `deploy/deploy.sh`: добавить `maxbot maxclientbot` в `up -d`.
- [ ] Прогон миграций на проде (общая БД → локального `migrate` достаточно, на сервере «up to date»).

### Task 11 — Тесты + верификация
- [ ] `cd server && npx vitest run` — зелёный (текущие 130 + новые).
- [ ] E2E вручную (за пользователем, по аналогии с Telegram): пригласить лицо в MAX → отчёт;
      привязать водителя в MAX → пройти заявку. «Косяки правим по ходу».

---

## Risks (после ревью)
- **R1 (снят до «дыма»):** JSON-схемы/медиа сверены по OpenAPI (D3/D4). Остаточный риск — мелкие
      расхождения форка; ловим инъекцией fetch в тестах + живым дымом на VPS.
- **R2 (снят):** deep-link уточнён — `max.ru/<bot>?start=<payload>`, изолирован в botConfig/routes.
- **R3 (СНЯТ):** два отдельных бота (D1=два) убирают смешивание driver/онбординг — V1/V2 неактуальны.
- **R4 (B1):** коллизии сессий между каналами — требуют переписать `botSession`/адаптер под
      `(channel, chat_id)` (Task 1b), иначе сломается и ПРОД-Telegram. Самый острый блокер.
- **R5:** нет CI-теста на сам бот — покрываем сервисы и маппинг ctx, бот проверяем «дымом».
- **R6 (B2):** доставка — person разворачивать в 0..2 target по каналам, revoke раздельный.
```
