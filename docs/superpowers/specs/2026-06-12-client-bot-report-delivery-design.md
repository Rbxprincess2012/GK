# Клиентский бот: авто-доставка отчётов о выполнении — Design Specification

Date: 2026-06-12

## Problem Statement

После того как менеджер подтверждает выполненную заявку («✓ Подтверждаю»), отчёт
о выполнении (текст по участкам + ссылка на фотоотчёт) должен **одной кнопкой**
уйти всем получателям клиента в Telegram — и в личные чаты людей, и в группы
заказчика. Сейчас доставка клиенту полностью ручная (диплинк + вставка текста),
клиентского бота-отправителя нет.

## Решения (зафиксированы в брейншторме 2026-06-12)

1. **Авто-отправка ботом (one-click).** Не ручной диплинк. Кнопка «Подтверждаю» =
   подтвердить + разослать. Кнопка «открыть чат» в обычном сценарии исчезает.
2. **Только Telegram.** MAX не трогаем — ни UI, ни модель данных (добавим позже).
3. **Отдельный список получателей на уровне клиента.** Доверенные лица (объект/
   участок, телефон для звонка водителя) остаются как есть — другая роль.

## Ключевое ограничение платформы (почему так, а не «вставь @username»)

Telegram-бот не может написать пользователю по `@username`/телефону/ссылке. Бот
пишет в личку **только если человек сам нажал «Старт»** у бота (тогда есть его
`chat_id`), а в группу — **только если бота туда добавили**. Поэтому получателя
нельзя «вписать ссылкой» — его нужно **онбордить**, и хранить `chat_id`, а не имя.

## Requirements

**Функциональные:**
- На уровне клиента — список получателей отчётов (личные чаты + группы).
- Онбординг лички: менеджер генерирует персональную ссылку `t.me/<clientbot>?start=<code>`,
  человек открывает → бот привязывает его `chat_id` к клиенту (статус `active`).
- Онбординг группы: менеджер генерирует код, добавляет бота в группу, отправляет
  `/bind <code>` в группе → бот привязывает `chat_id` группы.
- При «Подтверждаю» отчёт уходит всем `active`-получателям клиента; менеджер видит
  результат («Отправлено N»). Если активных нет — ручной фолбэк (как сейчас).
- Получателя можно отозвать (revoke).

**Нефункциональные:**
- Та же РФ/IPv4-инфра, что и у водительского бота (исходящие к `api.telegram.org`
  только по IPv4 — `extra_hosts`-пин в контейнерах).
- Токен клиентского бота — в Настройках админки (БД), `.env` как фолбэк (как у водителя).
- Отправка не должна держать открытой БД-транзакцию (HTTP вне tx).
- Под будущий SaaS: получатели и токен — per-owner/per-tenant-совместимо.

## Proposed Solution

**Новый процесс — клиентский бот** (отдельный токен, long-polling) отвечает ТОЛЬКО
за онбординг: приём `/start <code>` (личка) и `/bind <code>` (группа). **Отправку**
делает сам `api` напрямую через Telegram HTTP API (у него уже есть токен и IPv4-пин) —
не гоняем доставку через бот-процесс.

## Architecture

```
server/src/
  migrations/
    038_client_recipients.js     # таблица client_recipients; DROP clients.telegram_chat
  services/
    clientRecipients.js          # issueInvite(clientId,kind), bindByCode(code,{chat_id,kind,title}),
                                  #   listForClient(clientId), revoke(id)
    clientDelivery.js            # tgSend(token,chatId,text); sendReportToClient(orderId,{body})
    botConfig.js (изм.)          # + getClientBotToken(), getClientBotUsername()
    clientMessaging.js (изм.)    # confirmOrder: tx → коммит → sendReportToClient вне tx;
                                  #   убрать buildClientChatLink/telegram_chat
  routes/
    clientRecipients.js          # GET /clients/:id/recipients, POST …/dm, POST …/group,
                                  #   DELETE /recipients/:id  (requireRole manager/director/superuser)
    clientMessages.js (изм.)     # убрать client_chat из ответа
  bot/
    clientBot.js                 # grammY: /start <code> (dm), /bind <code> (group)
  clientBot.js                   # entrypoint: getClientBotToken() → createClientBot().start()
server/test/
  client-recipients.test.js      # issue/bind/revoke
  client-delivery.test.js        # sendReportToClient: только active, last_sent_at, мок fetch
  proof-review.test.js (изм.)    # confirm возвращает delivery; убрать client_chat-тест
src/
  store/clientRecipientsStore.js # CRUD получателей
  pages/Clients.jsx (изм.)       # блок «Telegram-получатели»: список + «+ Личный чат»/«+ Группа»
  components/admin/OrderModal.jsx (изм.)  # после confirm — тост о доставке; фолбэк-модалка если 0 active
  components/admin/ClientMessageModal.jsx (изм.) # убрать кнопку «открыть чат клиента» (client_chat)
docker-compose.prod.yml (изм.)   # сервис clientbot (image dispatcher-api, extra_hosts IPv4-пин)
package.json (изм.)              # script "client-bot": node src/clientBot.js
```

### Модель данных: `client_recipients`

| поле | тип | смысл |
|---|---|---|
| id | serial PK | |
| client_id | int FK clients CASCADE | владелец |
| kind | text | `'dm'` \| `'group'` |
| chat_id | bigint null | Telegram chat_id (после онбординга) |
| title | text null | имя/@username/название группы |
| status | text default `'pending'` | `pending`→`active`→`revoked` |
| verify_code | text null | одноразовый код привязки |
| verify_expires_at | timestamp null | срок кода (7 дней) |
| last_sent_at | timestamp null | последняя успешная отправка |
| created_at/updated_at | timestamps | |

`unique(chat_id)` — Postgres допускает несколько NULL, так что pending-строки не
конфликтуют. Индекс `(client_id, status)`.

`clients.telegram_chat` (добавлен 2026-06-11) — **удаляется** этой моделью; связанную
обвязку (`buildClientChatLink`, поле в форме, кнопка в ClientMessageModal) убрать.

### Онбординг

**Личка (dm):**
1. В карточке клиента «+ Личный чат» → `POST /clients/:id/recipients/dm` →
   `issueInvite(clientId,'dm')` создаёт `pending`-строку с `verify_code` → возвращает
   ссылку `t.me/<clientBotUsername>?start=<code>`.
2. Менеджер копирует ссылку, передаёт человеку любым каналом.
3. Человек открывает → бот `/start <code>` → `bindByCode(code,{chat_id,kind:'dm',title})`
   → строка `active`, в `title` — имя/`@username` из `ctx.from`.

**Группа (group):**
1. «+ Группа» → `POST /clients/:id/recipients/group` → `issueInvite(clientId,'group')`
   → возвращает `code` + инструкцию («добавьте @clientbot в группу и отправьте `/bind <code>`»).
2. Менеджер добавляет бота в группу, шлёт `/bind <code>` → `bindByCode(code,{chat_id:groupId,
   kind:'group',title:chat.title})` → `active`.

### Отправка на подтверждении

`confirmOrder(orderId)`:
1. **В транзакции:** статус→`done`, все под-задачи `proof_status='accepted'`,
   `onOrderAccepted` (token + outbox + строка `client_messages`) → возвращает `body`.
2. **Вне транзакции:** `sendReportToClient(orderId,{body})` — берёт `active`-получателей
   клиента, по каждому `tgSend(token, chat_id, body)`; успех → `last_sent_at`. Возвращает
   `{ sent, failed, recipients }`.
3. Итог: `{ token, body, report_url, delivery }`.

`tgSend` = `POST https://api.telegram.org/bot<token>/sendMessage {chat_id,text}` (IPv4-пин
контейнера `api` уже стоит). Сетевые ошибки/`403` копятся в `failed`, не роняют цикл.

### Фронт

- **Карточка клиента:** вместо одиночного поля «Telegram-чат» — блок «Telegram-получатели
  отчётов»: список (чип статуса `⏳ ожидает`/`✅ активен`, иконка `👤`/`👥`, имя/группа,
  «удалить»), кнопки «+ Личный чат» (показать ссылку для копирования) и «+ Группа»
  (показать код + инструкцию). Обновление — повторный GET (статус сам станет `active`).
- **OrderModal «Подтверждаю»:** после `confirm` — тост `Отчёт отправлен N получателям`.
  Если `recipients === 0` → открыть `ClientMessageModal` (ручной фолбэк). Иначе модалку
  не открываем.
- **Settings:** поле токена клиентского бота (`telegram_client_bot_token`) — как у водителя.

## Implementation Details

- Токен: `getClientBotToken()` = Настройки(`telegram_client_bot_token`) → `config.CLIENT_BOT_TOKEN`.
  `getClientBotUsername()` = Настройки(`client_bot_username`, бот пишет при старте) → getMe → env.
- `verify_code` — 6 цифр (`randomInt`). `bindByCode` проверяет `status='pending'` и совпадение
  `kind` (dm-код нельзя привязать к группе).
- Отправка вне БД-транзакции (HTTP не должен держать tx).
- Клиентский бот — отдельный контейнер `clientbot` (образ `dispatcher-api`, `command: npm run
  client-bot`, `extra_hosts: api.telegram.org:149.154.167.220`, `env_file`).

## Testing Strategy

- `client-recipients.test.js`: `issueInvite` создаёт pending+code; `bindByCode` → active,
  `chat_id`/`title` проставлены, повтор кода после привязки → null; `revoke` → revoked.
- `client-delivery.test.js`: `sendReportToClient` с мок-`fetch` шлёт только `active`,
  считает sent/failed, пишет `last_sent_at`; pending/revoked пропускает.
- `proof-review.test.js`: `confirm` возвращает `delivery`; интеграция: active-получатель
  → `sent=1`. Убрать `buildClientChatLink`-тест и client_chat.
- Бот-хендлеры тонкие (зовут сервис) — покрываются через сервис.

## Rollout Plan

1. Миграция 038 (таблица + drop telegram_chat) — прогон локально (общая БД) + в CI.
2. Завести клиентского бота в @BotFather, токен — в Настройки админки.
3. Добавить сервис `clientbot` в `docker-compose.prod.yml`, выкат авто-деплоем.
4. Онбордить тестовый личный чат + тестовую группу, прогнать `confirm` на заявке,
   проверить доставку.
5. Phase-0 чек: отдельный токен клиентского бота; исходящие к Telegram с прод-сервера
   (уже подтверждено для водительского — тот же IPv4-пин).
