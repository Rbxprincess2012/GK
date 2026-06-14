# ИИ-ассистент саппорта в админке (YandexGPT) — Implementation Plan

**Goal:** Встроенный в админку (`putevo.su/admin`) чат-помощник для **наших пользователей**
(менеджер/диспетчер/директор): отвечает на вопросы «как сделать X в сервисе», помогает
разобраться, ловит непонимание. Модель — **YandexGPT** (РФ-доступна, ключ/folder уже заведены).
Ответы **заземлены на базу знаний** (не выдумывает), с дисклеймером «ответ ИИ» и эскалацией к
человеку. Все вопросы логируются — это же ловит баги и пробелы в onboarding.

**Решения пользователя (2026-06-14):** аудитория — внутренние пользователи; канал — чат-виджет
в админке; модель — YandexGPT. Связанные памяти: [[stage2-roadmap]] (Yandex Cloud: folder
`b1gknn3t21eujoubtisf`, сервис-аккаунт `putevo-ai`, роль `ai.languageModels.user`, modelUri
`gpt://b1gknn3t21eujoubtisf/yandexgpt/latest`), [[deploy-prod]], [[roles-auth-model]].

**Tech stack:** Node ESM, Express, Knex, Postgres (общая dev/прод-схема, тест-схема
`dispatcher_test`). Тесты vitest+supertest (`cd server && npx vitest run`). Миграции knex,
следующая **046**. Фронт React/Vite (`src/`). Деплой push→CI→deploy→cron (api+web). YandexGPT —
HTTP API `llm.api.cloud.yandex.net`, заголовок `Authorization: Api-Key <ключ>`.

> SaaS: ключ Yandex и база знаний — per-tenant в будущем; не вводить глобальных допущений.

---

## ⚠️ Открытые решения

### D1. RAG: эмбеддинги или prompt-stuffing? — **РЕКОМЕНДУЮ: prompt-stuffing (MVP)**
База знаний небольшая (несколько страниц) → влезает целиком в system-промпт. Векторную БД
(эмбеддинги + поиск) НЕ делаем на MVP — это лишняя сложность. Когда база вырастет (или появятся
логи с частыми темами) — добавим retrieval отдельным шагом. Абстракцию `buildContext(question)`
заложим, чтобы потом подменить «вся база» на «релевантные куски».

### D2. История диалога — **клиентская (MVP)**
Историю последних N сообщений шлёт фронт в запросе; на сервере не персистим диалоги (только
лог Q&A для аналитики). Персистентные треды — позже.

### D3. Аутентификация YandexGPT — **Api-Key** ✅ ВЕРИФИЦИРОВАНО (ревью 2026-06-14)
Сервис-аккаунтный API-ключ, заголовок `Authorization: Api-Key <ключ>`. folder зашит в `modelUri`,
поэтому `x-folder-id` НЕ обязателен — но шлём его (`yandex_folder_id` и так есть, безвредно и
страхует). Ключ/folder из Настроек (`yandex_api_key`, `yandex_folder_id`); фолбэк — `process.env`
НАПРЯМУЮ (в `config.js` полей `YANDEX_*` нет, как и у geocode.js — читать env мимо config).

### D4. Какая модель — **`yandexgpt/latest` (Pro) для MVP; lite — опция**
`gpt://<folder>/yandexgpt/latest` = YandexGPT 5/5.1 Pro (лучше качество). Для простого FAQ можно
`yandexgpt-lite/latest` (заметно дешевле) — заложить как настраиваемый `yandex_model` (опц.),
дефолт Pro. Контекст 32k, потолок `maxTokens` 8000 (берём 1500).

---

## Phase 0 — Верификация YandexGPT API  ✅ выполнено ревью 2026-06-14

- [x] Эндпоинт `POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion`, тело
      `{ modelUri, completionOptions:{stream:false,temperature,maxTokens}, messages:[{role,text}] }`,
      ответ `result.alternatives[0].message.text`, роли system/user/assistant — ПОДТВЕРЖДЕНО.
- [x] Api-Key + `x-folder-id` (опц.) — ПОДТВЕРЖДЕНО. Доки: Yandex AI Studio (aistudio.yandex.ru/docs).
- [x] `usage` приходит СТРОКАМИ (`inputTextTokens`/`completionTokens`/`totalTokens`) → `Number()`.
      `alternatives[0].status`: ждём `ALTERNATIVE_STATUS_FINAL`; ловить `TRUNCATED_FINAL`/`CONTENT_FILTER`.
- [x] Хост — РФ-инфраструктура, доступен из РФ без VPN (R3 снят до «дыма»).
- [ ] **Живой дым на VPS:** `llm.api.cloud.yandex.net/...completion` ключом из Настроек = 200 +
      проверить TLS (вдруг Russian Trusted Root CA, как у geocode — тогда нужен insecure-флаг/CA в образ).
      Ключ в чат НЕ присылать.

---

## Architecture

```
docs/assistant/knowledge.md         ← база знаний (FAQ + как сделать X), курируется вручную
server/src/lib/yandexGpt.js         ← HTTP-клиент completion (Api-Key, modelUri, fetchImpl-инъекция)
server/src/services/assistant.js    ← сборка промпта (system+база+история+вопрос), вызов, лог
server/src/routes/assistant.js      ← POST /assistant/ask (любой залогиненный), rate-limit
server/src/migrations/046_assistant_logs.js ← лог вопросов/ответов
src/components/admin/AssistantWidget.jsx    ← плавающая кнопка «Помощник» + панель чата
```
Ключ Yandex — ТОЛЬКО на сервере, в ответ/фронт не отдаётся (как прочие токены).

---

## Tasks

### Task 1 — Миграция 046: assistant_logs
- [ ] Таблица `assistant_logs`: `id`, `user_id int nullable` (БЕЗ FK либо FK `onDelete SET NULL` —
      тест-байпас даёт `user.id=0`, которого нет в users; FK на 0 упадёт → в тестах писать null/
      реального юзера), `question text`, `answer text`, `ok boolean`, `escalated boolean default false`,
      `tokens int nullable`, `created_at`. Индекс по `created_at`. Лог = источник для роста базы.
      Чистка/ретеншн (ПД) — позже. Каждый тест-файл сам чистит `assistant_logs` (общая тест-схема).

### Task 2 — `lib/yandexGpt.js`
- [ ] `complete(messages, { apiKey, folderId, model='yandexgpt', temperature=0.3, maxTokens=1500, fetchImpl=fetch })`
      → POST completion, заголовки `Authorization: Api-Key <apiKey>` + `x-folder-id: <folderId>`,
      `modelUri = gpt://<folderId>/<model>/latest`. Возвращает `{ text, tokens: Number(usage.totalTokens),
      status }`. **Таймаут через `AbortController` (~30с)** — иначе зависший YandexGPT держит запрос и
      слот rate-limit. Ошибки (нет ключа / API !=200 / таймаут) — бросать с понятным status.
- [ ] Обрабатывать `alternatives[0].status`: `TRUNCATED_FINAL`/`CONTENT_FILTER` → флаг (не обычный ответ).
- [ ] Юнит-тест: shaping (URL, заголовки, modelUri, messages) с поддельным fetch; парс
      `result.alternatives[0].message.text`; `usage` как строки → число.

### Task 3 — База знаний `docs/assistant/knowledge.md`
- [ ] Структурированный FAQ/гайд: разделы — заявки и статусы, водители и смены, получатели
      отчётов (онбординг TG/MAX — переиспользовать гайд из чата 2026-06-14), распределение (DnD),
      роли/доступы, частые «почему не вижу…». Markdown, заголовки = темы.
- [ ] Загрузка с диска один раз (кэш), reload-хук опц.

### Task 4 — `services/assistant.js`
- [ ] `getYandexCreds()` — `(tokens.yandex_api_key||process.env.YANDEX_API_KEY)` и folder так же
      (паттерн `geocode.js:77-78`, читать env напрямую — в config.js полей нет).
- [ ] `SYSTEM_PROMPT`: роль «саппорт Putevo, отвечай ТОЛЬКО из базы ниже; нет ответа в базе —
      честно: „Точно не знаю — лучше спросить старшего/поддержку", НЕ выдумывай; коротко, по-русски,
      по-доброму». **System собирается ТОЛЬКО на сервере** (не из истории с фронта — защита от инъекции).
- [ ] `ask({ userId, question, history=[] })` → messages = [system, ...history(только user/assistant,
      обрезка), user] → `yandexGpt.complete` → лог в assistant_logs → ответ. Различать состояния:
      - нет ключа → `{ configured:false, answer:'Ассистент пока не настроен (нет ключа Yandex в Настройках).' }`;
      - API упал/таймаут → `{ ok:false, answer:'Помощник временно недоступен, попробуйте позже.' }` (лог ok=false);
      - норма → `{ ok:true, answer, escalate }`.
- [ ] Эвристика эскалации: ответ содержит маркер незнания → `escalate:true`.

### Task 5 — `routes/assistant.js`  ⚠️ BLOCKER-нейминг
- [ ] `POST /assistant/ask` — middleware **`requireUser`** (НЕ `requireAuth` — такого нет;
      НЕ `requireUserOrService` — ассистент не для n8n). Монтировать в `routes/index.js` ПОСЛЕ
      `api.use(requireUserOrService)`: `api.use('/assistant', requireUser, assistant)`. Внешний путь
      снаружи — `POST /api/assistant/ask` (`/api` от app.js).
- [ ] Тело `{ question, history? }`. Zod: вопрос ≤2000; `history` ≤10 и КАЖДЫЙ элемент
      `{ role: 'user'|'assistant', text }` — **`role:'system'` запрещён** (защита от инъекции).
- [ ] Rate-limit: in-memory per-user sliding-window (≤20/5 мин) → 429, с TTL-очисткой Map (утечка
      памяти). Один api-контейнер → корректно. Защита от перерасхода YandexGPT.

### Task 6 — Фронт `AssistantWidget.jsx`
- [ ] Плавающая кнопка «💬 Помощник» в `AdminShell` (после `.a-main-wrap`, `position:fixed`
      внизу справа). Клик → панель чата. Стиль — существующие `.a-*` классы (admin.css), тёмная тема.
- [ ] Поле ввода + лента; ответ помечен «🤖 ответ ИИ»; кнопка «Не помогло → позвать человека».
      История в state (только user/assistant), шлём в запрос. Зов `api.post('/assistant/ask',...)`
      (базовый клиент уже добавляет `/api`). **Явный axios `timeout` (~35с)** — иначе зависший ответ
      повесит UI; спиннер «печатает…».
- [ ] Ошибки/«не настроен» — через `useToast` (Toast.jsx), не новый стиль.
- [ ] Дисклеймер вверху панели: «Помощник на ИИ, может ошибаться. По спорному — к поддержке».

### Task 7 — Тесты + дым
- [ ] vitest: yandexGpt shaping (+usage-строки→число); assistant.ask (мок complete → лог пишется;
      нет ключа → configured:false; таймаут → ok:false); route rate-limit (supertest).
- [ ] Тест 401: из-за тест-байпаса (`authUser.js`: NODE_ENV=test без токена = суперюзер) слать
      НЕВАЛИДНЫЙ `Authorization: Bearer xxx` → `req.auth=null` → `requireUser` даёт 401.
- [ ] `npx vitest run` зелёный (НЕ `npm run migrate` — это прод-public). Живой дым на VPS после ключа.

---

## Risks (после ревью)
- **R1 (главный):** галлюцинации. Митигация — жёсткий system-промпт «только из базы + честное
      „не знаю"», дисклеймер, эскалация, лог для контроля качества. Это ПОМОЩНИК, не замена саппорта.
- **R2:** качество = качество базы. Старт малым, рост по логам реальных вопросов (Task 1).
- **R3 (снижен):** хост РФ-доступен из РФ; остаётся живой дым + проверка TLS (RTR CA, как у geocode).
- **R4:** ключ — только сервер (в ответ не отдаём; `/settings/tokens` под superuser). Инъекция через
      `history` с фронта — закрыта: zod запрещает `role:'system'`, system собирается на сервере.
- **R5:** стоимость/таймаут — cap `maxTokens` 1500 + rate-limit + `AbortController` 30с. Rate-limit
      per-process (один api-контейнер ок); при горизонтальном масштабировании — перенести в PG/Redis.
- **R6:** приватность — в вопросах данные клиентов; лог внутренний. Чтение логов (если роут появится) —
      только superuser. Ретеншн/чистка — позже; при SaaS — изоляция по тенанту.
