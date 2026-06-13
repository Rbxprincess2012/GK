# Публичная витрина putevo.su + кнопка «Личный кабинет» — план реализации

**Дата:** 2026-06-13
**Цель:** На корне `putevo.su` появляется публичная витрина с кнопкой «Личный кабинет».
По клику — модалка «Зайти в личный кабинет как» с кнопками **Сотрудник** (слева) и
**Клиент** (справа, пока неактивна). «Сотрудник» открывает модалку входа сотрудника.
SPA переезжает с `/admin` на корень `/`; `/admin/*` остаётся редиректом для старых ссылок.

**Подход (утверждён пользователем):** «Витрина на корне, вход в SPA» — витрина и модалки
входа живут внутри того же React-приложения; переиспользуем существующую логику авторизации.

**Стек:** React 18 + Vite + react-router-dom + motion/react + Zustand; бэк Node/Express/Knex;
прод — Docker Compose + Caddy (DNS-01) на VPS 212.60.21.97; pull-деплой через ветку `deploy`.

---

## Архитектура

### Принцип разводки маршрутов
НЕ переименовываем внутренние пути приложения (`/`, `/orders`, `/clients`, … остаются как есть —
их используют `navConfig.js`, диплинки, навигация). Вместо этого разводим по признаку «есть user»:

```
AppRoutes:
  loading → спиннер
  НЕТ user (гость):
    /set-password         → <SetPassword/>      (вход по приглашению, публичный)
    *                     → <PublicSite/>        (витрина: шапка + кнопка ЛК + модалки)
  ЕСТЬ user (сотрудник):
    <текущие защищённые роуты без изменений: Dashboard на '/', и т.д.>
    /login                → Navigate to '/'
```

После успешного входа `AuthContext.user` становится не-null → React перерисовывает дерево →
гость автоматически попадает в рабочее пространство. Внутренние пути целы.

### Новые файлы фронта
| Файл | Ответственность |
|------|-----------------|
| `src/pages/PublicSite.jsx` | Публичная витрина: шапка с лого Putevo + кнопка «Личный кабинет» справа; hero-заглушка. Держит состояние открытых модалок. |
| `src/components/public/AccountChoiceModal.jsx` | Модалка «Зайти в личный кабинет как»: кнопки **Сотрудник** \| **Клиент**(disabled). |
| `src/components/public/EmployeeLoginModal.jsx` | Модалка входа сотрудника (email + пароль), переиспользует `useAuth().login`. Задел под «Забыл пароль» / «Регистрация» (эпик #3) — пока ссылки-заглушки. |
| `src/components/public/public.css` (или блок в admin.css) | Стили витрины и модалок (тёмная тема, как Login). |

### Изменяемые файлы фронта
| Файл | Строка | Было | Станет |
|------|--------|------|--------|
| `vite.config.js` | 8 | `base: mode==='production' ? '/admin/' : '/'` | `base: '/'` |
| `src/App.jsx` | 102 | `basename={import.meta.env.BASE_URL.replace(/\/$/,'')}` | `basename=""` |
| `src/App.jsx` | 43–98 | один `<Routes>` под RequireAuth | развести гость/user (см. выше) |
| `src/lib/api.js` | 21 | `window.location.href = \`${import.meta.env.BASE_URL}login\`` | `window.location.href = '/login'` |

### Изменяемые файлы бэка
| Файл | Строка | Было | Станет |
|------|--------|------|--------|
| `server/src/lib/emailTemplates.js` | 7–8 | `return b ? \`${b}/admin\` : 'http://localhost:5174'` | `return b || 'http://localhost:5174'` (без `/admin`) |

Письма-приглашения станут `https://putevo.su/set-password?token=…` (вместо `/admin/set-password`).
`APP_URL` на проде уже `https://putevo.su` — проверить, что без `/admin`.

### Изменяемые файлы инфраструктуры
| Файл | Изменение |
|------|-----------|
| `deploy/Caddyfile` | Корень `putevo.su` отдаёт статику SPA (root `/srv/admin`, try_files, file_server). `/admin/*` → редирект на тот же путь без префикса (совместимость старых ссылок). `/api`, `/r`, `/media` — без изменений. |
| `deploy/Dockerfile.web` | Оставляем путь `/srv/admin` БЕЗ изменений (минус одна движущаяся часть) — меняем только Caddy root. |

**Решение:** НЕ трогаем `Dockerfile.web` (статика как лежала в `/srv/admin`, так и лежит).
Меняется только маршрутизация Caddy. Это снижает риск.

### Новый Caddyfile (блок putevo.su)
```caddy
putevo.su {
    encode zstd gzip

    handle /api/*   { reverse_proxy api:3000 }
    handle /r/*     { reverse_proxy api:3000 }
    handle /media/* { reverse_proxy api:3000 }

    # Совместимость: старые ссылки /admin/... → тот же путь на корне (с query/токеном)
    handle /admin/* {
        uri strip_prefix /admin
        redir {uri} 302
    }

    # Корень = SPA (витрина для гостя + админка для сотрудника)
    handle {
        root * /srv/admin
        try_files {path} /index.html
        file_server
    }
}
```

---

## Задачи

### Задача 1: Переезд SPA на корень (инфра-нейтральная часть фронта)
- [ ] `vite.config.js:8` → `base: '/'`
- [ ] `src/App.jsx:102` → `<BrowserRouter basename="">`
- [ ] `src/lib/api.js:21` → `window.location.href = '/login'`
- [ ] Сборка: `npm run build` (из `d:/Татьяна`), убедиться что ассеты в `dist/` ссылаются на `/assets/...` (а не `/admin/assets/...`)
- [ ] Проверка: `npm run lint` — затронутые файлы без новых ошибок

### Задача 2: Публичная витрина + модалки
- [ ] Создать `src/components/public/EmployeeLoginModal.jsx` — форма входа (email+пароль), `useAuth().login`, обработка `invalid_credentials`, лоадер. Ссылки «Забыл пароль»/«Регистрация» — пока заглушки (TODO эпик #3).
- [ ] Создать `src/components/public/AccountChoiceModal.jsx` — заголовок «Зайти в личный кабинет как», кнопка **Сотрудник** (onClick → открыть EmployeeLoginModal), кнопка **Клиент** (`disabled`, подпись «скоро»).
- [ ] Создать `src/pages/PublicSite.jsx` — шапка (лого Putevo слева, кнопка «Личный кабинет» справа), hero-заглушка; стейт: `choiceOpen`, `loginOpen`. Кнопка ЛК → `choiceOpen`. Сотрудник → `loginOpen`.
- [ ] Стили в `src/admin.css` (новый блок `.pub-*`) или `src/components/public/public.css`.

### Задача 3: Разводка маршрутов (гость vs сотрудник)
- [ ] `src/App.jsx` — в `AppRoutes`: если `!user` → `<Routes>` с `/set-password` и `*`→`<PublicSite/>`; если `user` → текущие защищённые роуты. `/login` для гостя ведёт на витрину, для user → `Navigate('/')`.
- [ ] Убедиться, что `RequireAuth` для user-ветки больше не редиректит на `/login` вхолостую (в user-ветке user всегда есть).
- [ ] Проверка вручную в dev (`npm run dev -- --port 5174`): гость видит витрину; вход → попадает в Dashboard; выход → витрина.

### Задача 4: Бэк — ссылки в письмах
- [ ] `server/src/lib/emailTemplates.js:7-8` — убрать `/admin` из `adminBase()`.
- [ ] Тесты: `cd server && npx vitest run` (без фильтра, ~4 мин). Проверить, что нет теста, жёстко ожидающего `/admin/set-password` (если есть — поправить ожидание на `/set-password`).

### Задача 5: Caddy
- [ ] `deploy/Caddyfile` — заменить блок `putevo.su` на новый (см. выше): корень → статика, `/admin/*` → strip+redir.
- [ ] Локально синтаксис не проверить (нет caddy) — проверка будет на деплое.

### Задача 6: Деплой и проверка на проде
- [ ] Перед деплоем по SSH: проверить `grep APP_URL /opt/dispatcher/.env` — должно быть `https://putevo.su` (без `/admin`). Если с `/admin` — поправить.
- [ ] Коммит → push main → дождаться промоушена в `deploy` (poll `git ls-remote origin deploy`).
- [ ] SSH: `bash /opt/dispatcher/deploy/deploy.sh` (пересоберёт web → новый Caddyfile + статика на корне).
- [ ] Проверки:
  - `curl -sk https://putevo.su/api/health` → `{"ok":true}`
  - `curl -skI https://putevo.su/` → 200, отдаётся `index.html` витрины (не редирект)
  - `curl -skI https://putevo.su/admin/` → 302 на `/`
  - Открыть putevo.su в браузере: видна витрина с кнопкой «Личный кабинет» → модалка выбора → Сотрудник → вход → Dashboard.
- [ ] Старая ссылка-приглашение `/admin/set-password?token=…` должна редиректить на `/set-password?token=…` (токен сохранён).

---

## Риски и заметки
- **Старые письма-приглашения** с `/admin/set-password` продолжат работать благодаря Caddy-редиректу
  `/admin/*` → `/*` с сохранением query (токена). Новые письма пойдут сразу на корень.
- **Кэш браузера / закладки** `/admin/...` у сотрудников — покроются тем же редиректом.
- **VITE_API_URL** зашит абсолютным (`https://putevo.su/api`) — не ломается.
- **Публичные отчёты** `/r/:token` и медиа `/media/*` — уже на корне, не трогаем.
- **Откат:** вернуть прежний `Caddyfile` (handle_path /admin/* + redir корня) и `base:'/admin/'`,
  пересобрать web. Изменения локализованы, откат дешёвый.

---

## Что НЕ входит в этот план (отдельно, позже)
- **Эпик #3** (самостоятельная регистрация директора: email+пароль → код на почту →
  подтверждение → welcome-модалка; «Забыл пароль»). Здесь только входная точка —
  модалка входа сотрудника с заглушками под эти ссылки.
- **Клиентский вход** (кнопка «Клиент») — неактивна, вернёмся позже.
- **Наполнение витрины** маркетинговым контентом — сейчас минимальная заглушка.
