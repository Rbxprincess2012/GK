# Клиентский бот: авто-доставка отчётов — Implementation Plan

**Goal:** Подтверждение заявки («✓ Подтверждаю») одной кнопкой рассылает отчёт о
выполнении всем Telegram-получателям клиента (личные чаты + группы) через отдельного
клиентского бота. Получатели онбордятся (личная ссылка / `/bind` в группе), хранится
`chat_id`. Только Telegram.

**Spec:** [docs/superpowers/specs/2026-06-12-client-bot-report-delivery-design.md](../specs/2026-06-12-client-bot-report-delivery-design.md)

**Tech stack:** Node ESM, Express, Knex, PostgreSQL (Timeweb managed, общая dev/прод).
Бот — grammY (long-polling, IPv4-пин к `api.telegram.org`). Тесты — vitest+supertest
(`server/test/*.test.js`, `resetDb`, прогон `cd server && npx vitest run` — без фильтра).
Миграции — knex, следующая **038**. Фронт — React/Vite (`src/`). Деплой — push в `main`
→ CI → ветка `deploy` → cron на проде (api+bot+clientbot+web). Я деплою сам по SSH-ключу.

> SaaS-замечание: получатели и токен — per-owner; не вводить глобальных допущений. См. [[saas-future]].

---

## Phase 0 — Проверить ДО старта (ops, без кода)

- [ ] **Отдельный токен** клиентского бота у @BotFather (НЕ водительский). Записать в
      Настройки админки (после Task 7) или временно в `server/.env` как `CLIENT_BOT_TOKEN`.
- [ ] Подтвердить, что бота можно добавлять в группы (Privacy Mode: для `/bind` в группе
      нужен доступ к командам — в @BotFather `/setjoingroups` ON; `/setprivacy` можно оставить
      ON, т.к. команды боту видны всегда).
- [ ] Исходящие к `api.telegram.org` с прод-сервера — уже работают по IPv4-пину (водитель).

---

## Architecture

См. спек, раздел Architecture. Каждый сервис — одна ответственность; Telegram-специфика
только в `bot/clientBot.js` и `services/clientDelivery.js` (HTTP sendMessage).

---

## Tasks

### Task 1 — Миграция 038: client_recipients + drop telegram_chat
- [ ] Создать `server/src/migrations/038_client_recipients.js`:
```js
export async function up(knex) {
  await knex.schema.createTable('client_recipients', (t) => {
    t.increments('id').primary()
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE')
    t.text('kind').notNullable()                    // 'dm' | 'group'
    t.bigInteger('chat_id').nullable()
    t.text('title').nullable()
    t.text('status').notNullable().defaultTo('pending')   // pending|active|revoked
    t.text('verify_code').nullable()
    t.timestamp('verify_expires_at').nullable()
    t.timestamp('last_sent_at').nullable()
    t.timestamps(true, true)
    t.index(['client_id', 'status'])
    t.unique(['chat_id'])   // несколько NULL допустимы в Postgres → pending не конфликтуют
  })
  if (await knex.schema.hasColumn('clients', 'telegram_chat')) {
    await knex.schema.alterTable('clients', (t) => t.dropColumn('telegram_chat'))
  }
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('client_recipients')
  if (!(await knex.schema.hasColumn('clients', 'telegram_chat'))) {
    await knex.schema.alterTable('clients', (t) => t.text('telegram_chat').nullable())
  }
}
```
- [ ] Verify: `cd server && npm run migrate` → «Batch N run: 1 migrations».
- [ ] Commit: `git commit -m "feat(db): client_recipients; drop clients.telegram_chat"`

### Task 2 — Откатить временную обвязку telegram_chat
Удаляем то, что добавили 2026-06-11 под одиночное поле (его заменяет client_recipients).
- [ ] `server/src/validators/client.js`: убрать строку `telegram_chat: z.string()...`.
- [ ] `server/src/services/clientMessaging.js`: удалить `buildClientChatLink`, убрать
      `cl.telegram_chat as client_telegram_chat` из `orderHead`.
- [ ] `server/src/routes/clientMessages.js`: убрать import `buildClientChatLink` и поле
      `client_chat` из ответа.
- [ ] `server/test/proof-review.test.js`: удалить тест `buildClientChatLink` и его import.
- [ ] `src/pages/Clients.jsx`: убрать поле «Telegram-чат для отчётов», `telegram_chat`
      из `emptyClient` и строку `payload.telegram_chat = …` в `saveClient`.
- [ ] `src/components/admin/ClientMessageModal.jsx`: убрать ветку `data.client_chat`
      (кнопка «Открыть чат клиента»), оставить только диплинки доверенного как фолбэк.
- [ ] Verify: `cd server && npx vitest run test/proof-review.test.js` зелёный;
      `cd "d:/Татьяна" && npm run lint` зелёный.
- [ ] Commit: `git commit -m "refactor: убрать одиночное clients.telegram_chat (заменено получателями)"`

### Task 3 — services/clientRecipients.js (онбординг-модель)
- [ ] Тест `server/test/client-recipients.test.js`:
  - `issueInvite(clientId,'dm')` → строка `status='pending'`, `verify_code` (6 цифр), `kind='dm'`.
  - `bindByCode(code,{chat_id:111,kind:'dm',title:'Иван @ivan'})` → `status='active'`,
    `chat_id=111`, `title` проставлен, `verify_code=null`.
  - `bindByCode(<dm-код>,{kind:'group',...})` → `null` (несовпадение kind).
  - повторный `bindByCode(code,…)` после привязки → `null` (код погашен).
  - `bindByCode('000000',…)` (нет такого) → `null`.
  - `revoke(id)` → `status='revoked'`. `listForClient(clientId)` → массив по `id`.
- [ ] Verify падает: `cd server && npx vitest run` (новый файл красный).
- [ ] Реализация `server/src/services/clientRecipients.js`:
```js
import { randomInt } from 'node:crypto'
import { db } from '../db.js'
const code6 = () => String(randomInt(100000, 1000000))
export async function issueInvite(clientId, kind) {
  const [row] = await db('client_recipients').insert({
    client_id: clientId, kind, status: 'pending',
    verify_code: code6(), verify_expires_at: db.raw("now() + interval '7 days'"),
  }).returning('*')
  return row
}
export async function bindByCode(verifyCode, { chat_id, kind, title }) {
  const r = await db('client_recipients').where({ verify_code: verifyCode, status: 'pending' }).first()
  if (!r || r.kind !== kind) return null
  const [row] = await db('client_recipients').where({ id: r.id })
    .update({ chat_id, title: title || null, status: 'active', verify_code: null, verify_expires_at: null, updated_at: db.fn.now() })
    .returning('*')
  return row
}
export const listForClient = (clientId) => db('client_recipients').where({ client_id: clientId }).orderBy('id')
export async function revoke(id) {
  const [row] = await db('client_recipients').where({ id }).update({ status: 'revoked', updated_at: db.fn.now() }).returning('*')
  return row
}
```
- [ ] Verify зелёный: `cd server && npx vitest run test/client-recipients.test.js`.
- [ ] Commit: `git commit -m "feat(client-recipients): онбординг-модель получателей"`

### Task 4 — botConfig: токен/username клиентского бота
- [ ] `server/src/services/botConfig.js`: добавить
```js
export async function getClientBotToken() {
  const t = await getTokens()
  return t?.telegram_client_bot_token || config.CLIENT_BOT_TOKEN || null
}
let cachedClientUsername = null
export async function getClientBotUsername(token = null) {
  if (cachedClientUsername) return cachedClientUsername
  const stored = await getSetting('client_bot_username')
  if (stored?.username) { cachedClientUsername = stored.username; return stored.username }
  const tk = token || (await getClientBotToken())
  if (tk) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tk}/getMe`)
      const data = await res.json()
      if (data?.result?.username) { cachedClientUsername = data.result.username; return cachedClientUsername }
    } catch { /* фолбэк ниже */ }
  }
  return config.CLIENT_BOT_USERNAME || null
}
```
- [ ] `server/src/config.js`: добавить чтение `CLIENT_BOT_TOKEN`, `CLIENT_BOT_USERNAME` из env
      (по образцу `DRIVER_BOT_TOKEN`).
- [ ] Verify: `cd server && node -e "import('./src/services/botConfig.js').then(m=>console.log(typeof m.getClientBotToken))"` → `function`.
- [ ] Commit: `git commit -m "feat(botConfig): токен/username клиентского бота"`

### Task 5 — services/clientDelivery.js (отправка)
- [ ] Тест `server/test/client-delivery.test.js`:
  - фикстура: клиент + заявка + 1 `active`-получатель (chat_id 111) + 1 `pending`.
  - `sendReportToClient(orderId,{ body:'привет', token:'t', fetchImpl })` с мок-fetch,
    возвращающим `{ ok:true }` → `{ sent:1, failed:0, recipients:1 }`, `last_sent_at` у active
    проставлен, pending не тронут, мок вызван с chat_id 111 и текстом «привет».
  - мок-fetch `{ ok:false }` → `{ sent:0, failed:1 }`.
- [ ] Verify падает.
- [ ] Реализация `server/src/services/clientDelivery.js`:
```js
import { db } from '../db.js'
import { getClientBotToken } from './botConfig.js'
export async function tgSend(token, chatId, text, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.json()
}
export async function sendReportToClient(orderId, { body, token, fetchImpl } = {}, conn = db) {
  const order = await conn('orders').where({ id: orderId }).first()
  if (!order) return { sent: 0, failed: 0, recipients: 0 }
  const tk = token || (await getClientBotToken())
  const recips = await conn('client_recipients').where({ client_id: order.client_id, status: 'active' })
  let sent = 0, failed = 0
  for (const r of recips) {
    try {
      const out = await tgSend(tk, r.chat_id, body, fetchImpl)
      if (out?.ok) { sent++; await conn('client_recipients').where({ id: r.id }).update({ last_sent_at: conn.fn.now() }) }
      else failed++
    } catch { failed++ }
  }
  return { sent, failed, recipients: recips.length }
}
```
- [ ] Verify зелёный.
- [ ] Commit: `git commit -m "feat(client-delivery): рассылка отчёта active-получателям"`

### Task 6 — confirmOrder: отправка вне транзакции
- [ ] Тест в `server/test/proof-review.test.js` (describe «подтверждение»):
  - фикстура с 1 `active`-получателем клиента (нужен мок отправки — вынести `fetchImpl`
    через параметр сервиса; в тесте звать `confirmOrder` напрямую с инъекцией). Проверить,
    что `confirm` возвращает `delivery.recipients>=1`; existing-тесты (done/token/outbox/
    «ждём заказа», 409) остаются зелёными.
- [ ] Реализация `server/src/services/clientMessaging.js` — переписать `confirmOrder`:
```js
import { sendReportToClient } from './clientDelivery.js'
export async function confirmOrder(orderId, { userId = null, sendImpl = sendReportToClient } = {}) {
  const acc = await db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).first()
    if (!order) throw Object.assign(new Error('not_found'), { status: 404 })
    if (order.status !== 'awaiting_confirmation') throw Object.assign(new Error('not_confirmable'), { status: 409 })
    await trx('orders').where({ id: orderId }).update({ status: 'done', done_at: order.done_at || trx.fn.now() })
    await trx('order_subtasks').where({ order_id: orderId })
      .update({ proof_status: 'accepted', reviewed_by: userId || null, reviewed_at: trx.fn.now() })
    return onOrderAccepted(orderId, { userId, channels: 'outbox' }, trx)
  })
  const delivery = await sendImpl(orderId, { body: acc.body })   // вне транзакции
  return { ...acc, delivery }
}
```
- [ ] `server/src/routes/orders.js`: вернуть `delivery` (уже возвращается весь объект).
- [ ] Verify: `cd server && npx vitest run` (полный прогон зелёный).
- [ ] Commit: `git commit -m "feat(confirm): авто-рассылка отчёта при подтверждении"`

### Task 7 — Роуты получателей
- [ ] `server/src/routes/clientRecipients.js`:
```js
import { Router } from 'express'
import { requireRole } from '../middleware/authUser.js'
import { issueInvite, listForClient, revoke } from '../services/clientRecipients.js'
import { getClientBotUsername } from '../services/botConfig.js'
const r = Router()
r.use(requireRole('manager', 'director', 'superuser'))
r.get('/clients/:id/recipients', async (req, res, next) => {
  try { res.json(await listForClient(Number(req.params.id))) } catch (e) { next(e) }
})
r.post('/clients/:id/recipients/dm', async (req, res, next) => {
  try {
    const row = await issueInvite(Number(req.params.id), 'dm')
    const u = await getClientBotUsername()
    res.status(201).json({ ...row, invite_link: u ? `https://t.me/${u}?start=${row.verify_code}` : null })
  } catch (e) { next(e) }
})
r.post('/clients/:id/recipients/group', async (req, res, next) => {
  try {
    const row = await issueInvite(Number(req.params.id), 'group')
    const u = await getClientBotUsername()
    res.status(201).json({ ...row, bot_username: u, bind_command: `/bind ${row.verify_code}` })
  } catch (e) { next(e) }
})
r.delete('/recipients/:id', async (req, res, next) => {
  try { res.json(await revoke(Number(req.params.id))) } catch (e) { next(e) }
})
export default r
```
- [ ] `server/src/routes/index.js`: `import clientRecipients` и `api.use(clientRecipients)`
      (рядом с прочими; пути уже включают `/clients/...` и `/recipients/...`).
- [ ] Тест в `client-recipients.test.js` (supertest): `POST /api/clients/:id/recipients/dm`
      → 201 + `invite_link` содержит `start=` + код; `GET …/recipients` → массив;
      `DELETE /api/recipients/:id` → revoked.
- [ ] Verify зелёный.
- [ ] Commit: `git commit -m "feat(api): роуты получателей отчётов клиента"`

### Task 8 — Клиентский бот (grammY)
- [ ] `server/src/bot/clientBot.js`:
```js
import { Bot } from 'grammy'
import { bindByCode } from '../services/clientRecipients.js'
export function createClientBot(token) {
  const bot = new Bot(token)
  bot.command('start', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Это бот уведомлений о выполнении заявок. Откройте персональную ссылку, которую дал менеджер.')
    const title = [ctx.from?.first_name, ctx.from?.username && `@${ctx.from.username}`].filter(Boolean).join(' ')
    const r = await bindByCode(code, { chat_id: ctx.chat.id, kind: 'dm', title })
    return ctx.reply(r ? 'Готово! Сюда будут приходить отчёты о выполнении ваших заявок.' : 'Ссылка недействительна или уже использована.')
  })
  bot.command('bind', async (ctx) => {
    const code = (ctx.match || '').trim()
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'
    const r = await bindByCode(code, {
      chat_id: ctx.chat.id, kind: isGroup ? 'group' : 'dm',
      title: isGroup ? ctx.chat.title : [ctx.from?.first_name, ctx.from?.username && `@${ctx.from.username}`].filter(Boolean).join(' '),
    })
    return ctx.reply(r ? '✅ Привязано — сюда будут приходить отчёты о выполнении.' : 'Код недействителен или уже использован.')
  })
  return bot
}
```
- [ ] `server/src/clientBot.js` (entry, по образцу `bot.js`):
```js
import { createClientBot } from './bot/clientBot.js'
import { getClientBotToken } from './services/botConfig.js'
import { setSetting } from './services/settings.js'
const token = await getClientBotToken()
if (!token) { console.error('[client-bot] Токен не задан (Настройки → клиентский бот).'); process.exit(1) }
const bot = createClientBot(token)
bot.catch((err) => console.error('[client-bot] error:', err))
bot.start({ onStart: async (me) => { await setSetting('client_bot_username', { username: me.username }).catch(() => {}); console.log(`[client-bot] @${me.username} запущен (long-polling)`) } })
```
- [ ] `server/package.json`: в `scripts` добавить `"client-bot": "node src/clientBot.js"`.
- [ ] Verify (без боевого токена): `cd server && node -e "import('./src/bot/clientBot.js').then(m=>console.log(typeof m.createClientBot))"` → `function`.
- [ ] Commit: `git commit -m "feat(client-bot): grammY-бот онбординга получателей"`

### Task 9 — Настройки: токен клиентского бота
- [ ] Фронт `src/pages/Settings.jsx` (или где токен водителя): добавить поле
      `telegram_client_bot_token` (как у водительского — маскированный ввод + сохранение).
- [ ] Бэкенд `server/src/services/settings.js` / `getTokens`: включить
      `telegram_client_bot_token` в набор хранимых токенов (по образцу `telegram_driver_bot_token`).
- [ ] Verify: `npm run build` зелёный; ручная проверка ввода токена в админке.
- [ ] Commit: `git commit -m "feat(settings): токен клиентского бота"`

### Task 10 — Фронт: получатели в карточке клиента
- [ ] `src/store/clientRecipientsStore.js`: `fetch(clientId)`, `addDm(clientId)`,
      `addGroup(clientId)`, `remove(id)` — поверх `api`.
- [ ] `src/pages/Clients.jsx`: в форме клиента блок «Telegram-получатели отчётов»:
  - список из стора: чип `⏳ ожидает`/`✅ активен`, иконка `👤`/`👥`, `title`, кнопка «✕».
  - «+ Личный чат» → `addDm` → показать `invite_link` с кнопкой «Копировать».
  - «+ Группа» → `addGroup` → показать `bind_command` + «добавьте @{bot_username} в группу».
  - кнопка «Обновить» (повторный `fetch`) — статус станет `активен` после онбординга.
- [ ] Verify: `npm run lint` + `npm run build` зелёные; ручная проверка.
- [ ] Commit: `git commit -m "feat(admin): получатели отчётов в карточке клиента"`

### Task 11 — OrderModal: тост о доставке + фолбэк
- [ ] `src/store/ordersStore.js`: `confirm` уже возвращает `data` (теперь с `delivery`).
- [ ] `src/components/admin/OrderModal.jsx` `doConfirm`:
```js
const res = await confirm(order.id)
const d = res?.delivery
if (d && d.recipients > 0) { toast.success(`Отчёт отправлен получателям: ${d.sent}${d.failed ? `, ошибок ${d.failed}` : ''}`); onChanged() }
else { toast.success('Заявка подтверждена — получателей нет, отправьте вручную'); setConfirmFlow(true); setMsgOpen(true) }
```
  (Убрать прежнее безусловное открытие ClientMessageModal.)
- [ ] Verify: `npm run lint` зелёный.
- [ ] Commit: `git commit -m "feat(admin): подтверждение — тост о доставке, ручной фолбэк без получателей"`

### Task 12 — Деплой клиентского бота
- [ ] `docker-compose.prod.yml`: сервис `clientbot` по образцу `bot`:
```yaml
  clientbot:
    build: ./server
    image: dispatcher-api
    container_name: dispatcher-clientbot
    restart: unless-stopped
    command: npm run client-bot
    env_file: ./server/.env.production
    extra_hosts:
      - "api.telegram.org:149.154.167.220"
    depends_on:
      - api
    volumes:
      - media_data:/app/media
```
- [ ] `deploy/deploy.sh`: в `up -d` добавить `clientbot` (`up -d api bot clientbot web`).
- [ ] Commit: `git commit -m "chore(deploy): процесс клиентского бота"`
- [ ] После мёрджа в `deploy`: на сервере прокинуть `CLIENT_BOT_TOKEN` (или через Настройки),
      поднять `clientbot`, проверить лог `[client-bot] @… запущен`.

---

## Self-review checklist
- [x] Каждая задача ссылается на конкретные файлы/пути.
- [x] Нет placeholder'ов — указаны сигнатуры, миграции, тела функций, команды.
- [x] Тесты до реализации (Tasks 3,5,6,7).
- [x] Команды точные: `cd server && npm run migrate`, `npx vitest run`, `npm run lint/build`.
- [x] Phase-0 (токен/группы) явный; бот (Task 8) и деплой (Task 12) — после сервисов.
- [ ] (ручное) Завести клиентского бота в @BotFather и внести токен.

## Замечания по разбиению
Tasks 1–7 (БД/сервисы/роуты) автономны от Telegram, тестируются через vitest. Task 8
(бот) и 12 (деплой) зависят от Phase-0 (токен). Фронт 9–11 — после роутов.

## Execution Handoff
Два пути:
- **superpowers:subagent-driven-development** — свежий субагент на задачу с ревью
  (рекомендую для server-задач 1–7: чистый TDD).
- **superpowers:executing-plans** — инлайн с чекпойнтами (удобно для бота 8 и фронта 9–11).
