# Putevo — восстановление системы с нуля

> Документ написан **2026-07-25**, когда проект ставился на паузу и сносились сервер и база.
> Читать целиком перед первым восстановлением. Секретов здесь нет — они в архиве бэкапа (см. §2).

**Что произошло 2026-07-25:** сняты полные резервные копии, затем удалены VPS `212.60.21.97`
и managed PostgreSQL `ef67476a3eac0d3eda7a6172.twc1.net`. Всё остальное (код, домен, боты,
внешние ключи) оставлено живым.

---

## 0. TL;DR — восстановление за ~40 минут

```
1. Создать managed PostgreSQL (PG 18) в Timeweb          →  ~5 мин
2. Создать VPS Ubuntu 24.04, 2 ГБ RAM, локация СПб        →  ~5 мин
3. Docker + swap 4 ГБ                                      →  ~5 мин
4. git clone репо в /opt/dispatcher, ветка deploy           →  ~1 мин
5. Восстановить server/.env.production из бэкапа (новый PGPASSWORD) → ~2 мин
6. pg_restore дампа + распаковка медиа в volume            →  ~3 мин
7. Переключить A-записи putevo.su и *.putevo.su на новый IP →  ~2 мин + прогрев DNS
8. Собрать образы и поднять стек, cron автодеплоя          →  ~15 мин (первая сборка Caddy — 13 мин)
```

Полная проверка — §4.

---

## 1. Инвентарь: что было и что уцелело

### Снесено (восстанавливать заново)

| Что | Было | Чем заменяется |
|---|---|---|
| App-сервер | Timeweb VPS, СПб, `212.60.21.97`, hostname `spb-3-vm-nvjg`, Ubuntu 24.04, 2 ГБ RAM, 29 ГБ диск, swap 4 ГБ | Новый VPS, **обязательно локация СПб** (см. §6.1) |
| База | Timeweb managed PostgreSQL 18.4, хост `ef67476a3eac0d3eda7a6172.twc1.net` (IP `85.239.47.178`), пользователь `gen_user`, база `default_db`, SSL `require`, размер 14 МБ | Новый managed PG **18 или новее** + `pg_restore` дампа |
| Медиа-пруфы | docker volume `dispatcher_media_data`, 15 файлов, 3 МБ | Распаковка `media_data.tar.gz` в новый volume |
| Сертификаты HTTPS | docker volume `dispatcher_caddy_data` | Выпускаются заново автоматически (Let's Encrypt, DNS-01) |

### Уцелело (трогать не нужно)

| Что | Где | Примечание |
|---|---|---|
| Код | GitHub `https://github.com/Rbxprincess2012/GK.git`, ветки `main` и `deploy` (обе на `0b09778`) | Плюс полный `git bundle` в бэкапе |
| Домен | `putevo.su`, DNS-зона в панели Timeweb | Нужно только переписать A-записи на новый IP |
| Боты Telegram | @wasteDRIVER_bot (водительский), @wasteClient_bot (клиентский) | Токены живы, лежат в дампе БД (`settings.integration_tokens`) |
| Боты MAX | `id910816974351_bot` (водительский), `id910816974351_1_bot` (клиентский) | Токены там же |
| Внешние ключи | DaData, YandexGPT/геокодер | В дампе БД (`settings.integration_tokens`); ротацию см. §6.9 |
| Timeweb API-токен | `TW_TOKEN` — нужен Caddy для DNS-01 | В бэкапе (`env.root`) |
| SMTP | почта отправителя, порт 465 | В бэкапе (`env.production`) |

---

## 2. Резервные копии

Сняты **2026-07-25** с живого прода, лежат в `D:\Putevo-backup-2026-07-25\`.
⚠️ **В папке лежат секреты в открытом виде** — не класть в git, не заливать в публичные хранилища.

| Файл | Размер | Что это |
|---|---|---|
| `putevo-db.dump` | 183 КБ | Дамп БД, формат custom (`pg_dump -Fc`) — **основной**, ставится через `pg_restore` |
| `putevo-db.sql.gz` | 57 КБ | Тот же дамп в plain SQL — читаемый глазами, запасной вариант через `psql` |
| `media_data.tar.gz` | 3 МБ | Содержимое volume `dispatcher_media_data` (фото/видео/голос из ботов) |
| `env.production` | — | Полный `server/.env.production` с прода: PG-креды, `AUTH_SECRET`, `SERVICE_TOKEN`, суперюзер, SMTP |
| `env.root` | — | `/opt/dispatcher/.env` — `TW_TOKEN` (Timeweb API, нужен Caddy для DNS-01) |
| `GK-repo-full.bundle` | 1.4 МБ | Весь репозиторий со всей историей и ветками — страховка на случай пропажи GitHub |
| `crontab.root.txt` | — | Cron автодеплоя |
| `services.txt`, `git-head.txt` | — | Снимок работавших контейнеров и коммит прода (`0b09778`) |

**Восстановить репозиторий из бандла** (если GitHub всё-таки пропадёт):
```bash
git clone /path/to/GK-repo-full.bundle GK
cd GK && git remote set-url origin <новый-remote>
```

### Как переснять бэкап, пока сервер ещё жив

Если между снятием и сносом кто-то поработает в системе (боты живые — клиенты могут писать),
дамп устареет. Пересъёмка одной командой с рабочей машины:

```bash
ssh -i ~/.ssh/putevo_deploy root@СЕРВЕР 'bash -s' <<'EOF'
mkdir -p /root/putevo-backup && cd /opt/dispatcher
docker run --rm --env-file server/.env.production -v /root/putevo-backup:/b postgres:18-alpine \
  sh -c 'pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-privileges -Fc -f /b/putevo-db.dump'
docker run --rm -v dispatcher_media_data:/m -v /root/putevo-backup:/b alpine tar czf /b/media_data.tar.gz -C /m .
EOF
scp -i ~/.ssh/putevo_deploy root@СЕРВЕР:/root/putevo-backup/* D:\Putevo-backup-2026-07-25\
```

Проверка после скачивания: `md5sum` локально и на сервере должны совпасть, а
`pg_restore --list putevo-db.dump | grep -c 'TABLE DATA'` — вернуть 40 (число таблиц с данными).

### Контрольные счётчики (состояние на момент снятия)

После `pg_restore` числа должны совпасть — запрос в §4.

```
users 3          companies 0        clients 20        objects 43
sections 115     drivers 11         vehicles 5        vehicle_types 4
container_types 1  orders 423       order_items 120   attachments 23
shifts 41        streets 2217       trusted_persons 25
client_recipients 14  channels 1    knex_migrations 53
```

`knex_migrations 53` = миграции применены до `052_order_item_trusted_person.js` включительно.

---

## 3. Пошаговое восстановление

### 3.1. База данных

В панели Timeweb → Базы данных → создать **PostgreSQL 18** (или новее; ниже 18 — нельзя,
дамп снят с 18.4). Записать: хост, порт, пользователя, имя базы, пароль.

Расширений и кастомных схем в дампе нет — всё в `public`, восстановление тривиально.

### 3.2. VPS

Timeweb → Облачные серверы → создать:
- **Локация: Санкт-Петербург** (критично — см. §6.1)
- Ubuntu 24.04, минимум 2 ГБ RAM, 30 ГБ диск
- Записать публичный IP → далее `NEW_IP`

Подготовка (один раз, под root):
```bash
ssh root@NEW_IP

# Docker
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version

# Swap 4 ГБ — без него vite-сборка фронта падает по памяти на 2 ГБ RAM
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon --show

# SSH-ключ для удалённой работы (публичная часть — ~/.ssh/putevo_deploy.pub на рабочей машине)
mkdir -p /root/.ssh && cat >> /root/.ssh/authorized_keys <<'KEY'
<содержимое putevo_deploy.pub>
KEY
chmod 600 /root/.ssh/authorized_keys
```

Firewall на Timeweb по умолчанию выключен, `ufw` на старом сервере был `inactive` — оставить так же,
иначе Caddy не получит трафик на 80/443.

### 3.3. Код

```bash
mkdir -p /opt/dispatcher && cd /opt/dispatcher
git clone https://github.com/Rbxprincess2012/GK.git .
git checkout deploy      # прод всегда живёт на ветке deploy, не main (см. §6.5)
```

### 3.4. Секреты

```bash
# 1) server/.env.production — скопировать с рабочей машины
scp D:\Putevo-backup-2026-07-25\env.production root@NEW_IP:/opt/dispatcher/server/.env.production

# 2) поправить под новую БД
nano /opt/dispatcher/server/.env.production
#    PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE — новые значения из §3.1
#    остальное (AUTH_SECRET, SERVICE_TOKEN, SUPERUSER_*, APP_URL, SMTP_*) оставить как есть

# 3) корневой .env с токеном Timeweb API (нужен Caddy для DNS-01)
scp D:\Putevo-backup-2026-07-25\env.root root@NEW_IP:/opt/dispatcher/.env
```

Полный перечень переменных и их смысл — в [server/.env.production.example](../server/.env.production.example)
и в схеме валидации [server/src/config.js](../server/src/config.js) (при старте бэкенд падает,
если обязательные переменные не заданы — это нормально и полезно).

> `AUTH_SECRET` менять не обязательно; если поменяете — все выданные JWT/сессии умрут,
> пользователям придётся войти заново. Данных это не портит.

### 3.5. Данные

**База:**
```bash
scp D:\Putevo-backup-2026-07-25\putevo-db.dump root@NEW_IP:/root/

# на сервере, из /opt/dispatcher
docker run --rm --env-file /opt/dispatcher/server/.env.production \
  -v /root:/b postgres:18-alpine \
  sh -c 'pg_restore --no-owner --no-privileges -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" /b/putevo-db.dump'
```
Запасной путь, если дамп custom-формата не зашёл:
```bash
docker run --rm --env-file /opt/dispatcher/server/.env.production -v /root:/b postgres:18-alpine \
  sh -c 'gunzip -c /b/putevo-db.sql.gz | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE"'
```

После восстановления **миграции не гонять руками** — таблица `knex_migrations` приехала вместе
с дампом, `npm run migrate` в деплое сам скажет «Already up to date».

**Медиа:**
```bash
scp D:\Putevo-backup-2026-07-25\media_data.tar.gz root@NEW_IP:/root/

docker volume create dispatcher_media_data
docker run --rm -v dispatcher_media_data:/m -v /root:/b alpine \
  tar xzf /b/media_data.tar.gz -C /m
```
> Имя volume должно быть именно `dispatcher_media_data` — compose составляет его как
> `<имя проекта>_<имя volume>`, а имя проекта берётся из каталога `/opt/dispatcher`.
> Если код положен в другой каталог — имя volume изменится.

### 3.6. DNS

Панель Timeweb → Домены → `putevo.su` → DNS-записи. Переписать на `NEW_IP`:
- `A putevo.su → NEW_IP`
- `A *.putevo.su → NEW_IP` (wildcard, покрывает `n8n.putevo.su`)
- TTL 600

Дождаться прогрева (обычно минуты): `nslookup putevo.su` должен вернуть `NEW_IP`.
**Поднимать Caddy до прогрева DNS не обязательно** — сертификат выпускается через DNS-01
(TXT-запись, Timeweb API), а не через входящее соединение, но `APP_URL` и ссылки в отчётах
всё равно ведут на домен, так что проще сначала DNS.

### 3.7. Запуск стека

```bash
cd /opt/dispatcher

# Caddy с DNS-плагином timeweb — отдельный образ, собирается ~13 минут, ОДИН раз
docker build -t dispatcher-caddy:local -f deploy/Dockerfile.caddy .

# Приложение (api ~1 мин, web/фронт ~2 мин)
docker compose -f docker-compose.prod.yml build api web

# Миграции (после pg_restore — no-op; при чистом старте создадут схему)
docker compose -f docker-compose.prod.yml run --rm api npm run migrate

# Поднять всё, КРОМЕ n8n (n8n требует server/.env.n8n, которого нет, и не используется)
docker compose -f docker-compose.prod.yml up -d api bot clientbot maxbot maxclientbot web

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50
```

### 3.8. Автодеплой

```bash
crontab -e
# добавить строку:
*/2 * * * * bash /opt/dispatcher/deploy/deploy.sh >> /var/log/dispatcher-deploy.log 2>&1
```

Скрипт [deploy/deploy.sh](../deploy/deploy.sh) идемпотентен: тихо выходит, если `origin/deploy`
не сдвинулся; при новом коммите — `git reset --hard origin/deploy`, пересборка `api` + `web`,
миграции, `up -d`. Пуш в `main` → CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml))
гоняет тесты и сборку → при зелёном промоутит `main` в `deploy` → сервер подхватывает за ≤2 минуты.

---

## 4. Проверка

```bash
# 1. Здоровье API
curl -s https://putevo.su/api/health          # → {"ok":true}

# 2. Данные на месте — сверить с контрольными счётчиками из §2
docker run --rm --env-file /opt/dispatcher/server/.env.production postgres:18-alpine \
  sh -c 'psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -At -c "
    select '\''orders'\'', count(*) from orders union all
    select '\''clients'\'', count(*) from clients union all
    select '\''drivers'\'', count(*) from drivers union all
    select '\''streets'\'', count(*) from streets"'

# 3. Контейнеры живы
docker compose -f docker-compose.prod.yml ps    # 6 сервисов Up

# 4. Боты подключились — в логах не должно быть таймаутов к api.telegram.org
docker logs dispatcher-bot --tail=20
docker logs dispatcher-clientbot --tail=20
```

Руками:
- `https://putevo.su/` → SPA, вход суперюзером (креды — `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` из `env.production`)
- Настройки → токены ботов на месте (приехали с дампом), база/полигон, DaData, YandexGPT
- В @wasteDRIVER_bot отправить `/start` → бот отвечает
- Открыть любой прошлый отчёт `https://putevo.su/r/<token>` → страница со фото (проверяет медиа-volume)
- Старая ссылка `https://putevo.su/admin/...` → редирект на корень (см. Caddyfile)

---

## 5. Альтернатива: чистый старт без старых данных

Если данные не нужны — пропустить §3.5 и вместо этого:

```bash
docker compose -f docker-compose.prod.yml run --rm api npm run migrate
docker compose -f docker-compose.prod.yml run --rm api npm run seed:superuser
docker compose -f docker-compose.prod.yml run --rm api npm run seed:streets   # справочник улиц
docker compose -f docker-compose.prod.yml exec -T api node -e "..."           # или psql: server/src/seeds/defaults.sql
```

Дальше **обязательно руками в админке** (иначе система полурабочая):
1. Настройки → вписать токены обоих Telegram-ботов и обоих MAX-ботов (взять из бэкапа: `settings.integration_tokens` в `putevo-db.sql.gz`)
2. Настройки → DaData-токен, ключи YandexGPT/геокодера
3. Настройки → адрес базы и полигона, регион распределения (было: база «Краснодар, Чехова 2», регион «Краснодар»)
4. Настройки → контакты менеджера (`org.manager_name` / `org.manager_phone`) — попадают в отчёт клиенту
5. Справочник «Контейнеры» → завести размеры, иначе у машин не выбираются размеры
6. Завести машины, водителей, клиентов

После смены токена бота — перезапустить его сервис: `docker compose -f docker-compose.prod.yml restart bot`.

---

## 6. Известные грабли

На каждую из них уже потрачено время — не наступать повторно.

### 6.1. Локация сервера: только Санкт-Петербург
Старый московский IP `217.149.30.139` (подсеть `217.149.30.0/24`) **фильтровался ТСПУ из РФ-сетей**:
`ERR_CONNECTION_TIMED_OUT` при чистых реестрах РКН. Из-за этого 2026-06-11 был переезд в СПб.
Если новый сервер окажется недоступен из РФ — это не фаервол и не DNS, а фильтрация IP-пула:
лечится только сменой IP/локации.

Ложный след из той диагностики: `curl` под Windows через VPN даёт `HTTP 000` на любой HTTPS
(schannel не может проверить отзыв сертификата) — лечится `--ssl-no-revoke`, к серверу отношения не имеет.

### 6.2. Telegram — только по IPv4
С сервера маршрут до `api.telegram.org` по IPv6 мёртв, а резолвер отдаёт AAAA → long-polling и
`getFile` виснут. В `docker-compose.prod.yml` у `api`, `bot`, `clientbot` прибит
`extra_hosts: api.telegram.org:149.154.167.220`. **Не удалять.** Если Telegram сменит IP —
взять новый через `dig +short api.telegram.org A` с любой машины и обновить.
Проверка «`curl https://api.telegram.org` с сервера не работает» — это ожидаемо (curl идёт по IPv6),
не признак поломки. MAX (`platform-api.max.ru`) — РФ-хост, пина не требует.

### 6.3. npm из РФ на этапе сборки
`registry.npmjs.org` таймаутит на тарболах → `npm ci` падает с `Exit handler never called!`
(выглядит как OOM, но это сеть). В [deploy/Dockerfile.web](../deploy/Dockerfile.web) сборка
фронта идёт через зеркало `registry.npmmirror.com` с ретраями. Go-модули для Caddy —
через `goproxy.cn` ([deploy/Dockerfile.caddy](../deploy/Dockerfile.caddy)).
Общий принцип: **всё зарубежное на этапе сборки тянуть через РФ-доступные зеркала**.

### 6.4. Docker Hub 429
С IP Timeweb анонимный pull иногда упирается в лимит. Лечение — зеркала в `/etc/docker/daemon.json`:
```json
{ "registry-mirrors": ["https://dockerhub.timeweb.cloud", "https://mirror.gcr.io"] }
```
(`systemctl restart docker` после правки). На снесённом сервере файла в итоге не было — pull работал
напрямую. Заводить только если поймаете 429.

### 6.5. Прод живёт на ветке `deploy`, не `main`
GitHub Actions **не может** деплоить по SSH: трансграничная фильтрация рвёт рукопожатие от раннеров
(US) до VPS (`handshake failed: EOF`, в логе sshd попытки даже нет). Поэтому модель pull:
CI гоняет тесты на `main` → при зелёном пушит в `deploy` → сервер сам тянет `origin/deploy` по cron.
Никогда не переключать сервер на `main` — потеряется гейт тестов.

### 6.6. `git fetch` к GitHub периодически рвётся
В логе деплоя за 5 недель ~20 обрывов (`SSL connection timeout`, `Recv failure`, `GnuTLS recv error`) —
трансграничная нестабильность. Не страшно: `deploy.sh` под `set -e` просто выходит, следующий
запуск через 2 минуты догоняет. Если обрывы станут постоянными — доставлять код `rsync`/`scp`
с рабочей машины или поднять зеркало репо на РФ-хостинге.

### 6.7. Как правильно проверять, доехал ли деплой
- **Не по хешу бандла.** Прод-сборка зашивает свой `VITE_API_URL`, поэтому хеш `index-*.js`
  законно отличается от локального `npm run build` при идентичном коде.
- **Только по строке, уникальной для изменения** (новый CSS-класс, новый текст). Грубый греп ловит
  такой же текст в несвязанном месте и «подтверждает» что угодно.
- Проверка кода в живом контейнере: `docker exec dispatcher-bot grep -c "<уникальная строка>" /app/src/...`
- После пуша ждать ~3–4 минуты (cron 2 мин + сборка 1–2 мин), затем Ctrl+Shift+R.

### 6.8. n8n не используется
Сервис `n8n` описан в compose, но **не поднимается**: требует `server/.env.n8n`, которого нет,
и полный `docker compose up -d` из-за этого падает. Все рассылки идут напрямую из API
(`services/clientMessaging.js`). Поднимать только `api bot clientbot maxbot maxclientbot web`.

### 6.9. Ротация ключей
Через чат в разное время проходили: пароль БД `gen_user`, два Timeweb API-токена
(в т.ч. `api_key_id 5d2cda00-4fdb-4b7e-9972-373ba28a2f83`), Yandex Cloud API-ключ сервисного
аккаунта `putevo-ai`, ключи DaData (API + секретный), невалидный Cloudflare-токен.
Все считать скомпрометированными. Пароль БД снимается с повестки сам собой (база удалена).
Остальные — перевыпустить при возобновлении работы: Timeweb → API, Yandex Cloud → `putevo-ai`,
кабинет dadata.ru. После смены обновить `server/.env.production` (`TW_TOKEN` — в `/opt/dispatcher/.env`,
ключи DaData/Yandex — в Настройках админки, они живут в БД).

### 6.10. Часовой пояс
Сервер работал в **UTC**, приложение — с `Europe/Moscow` в логике (`GENERIC_TIMEZONE`/`TZ` заданы
только у n8n). Даты типа `DATE` отдаются строкой (`pg.types.setTypeParser(1082)` в
[server/src/db.js](../server/src/db.js)) — иначе они уезжали на день назад. Ничего специально
настраивать не нужно, но при странностях с датами смотреть сюда.

### 6.11. Порядок первого старта Caddy
`dispatcher-caddy:local` должен существовать **до** `docker compose build web` — `Dockerfile.web`
использует его как базовый образ (`FROM dispatcher-caddy:local`). `deploy.sh` собирает его сам,
если образа нет, но при ручном первом подъёме собрать явно (§3.7). Сборка ~13 минут — это нормально,
дальше пересборка нужна только при обновлении Caddy или плагина.

---

## 7. Карта системы

### Сервисы (docker-compose.prod.yml)

| Контейнер | Образ | Команда | Роль |
|---|---|---|---|
| `dispatcher-api` | `dispatcher-api` | `node src/server.js` | REST API, публичные отчёты `/r/`, отдача `/media`, рассылки клиентам |
| `dispatcher-bot` | тот же | `npm run bot` | Водительский Telegram-бот (long-polling) |
| `dispatcher-clientbot` | тот же | `npm run client-bot` | Клиентский Telegram-бот: онбординг получателей отчётов (`/start`, `/bind`) |
| `dispatcher-maxbot` | тот же | `npm run max-bot` | Водительский MAX-бот (зеркало Telegram) |
| `dispatcher-maxclientbot` | тот же | `npm run max-client-bot` | Клиентский MAX-бот |
| `dispatcher-web` | `dispatcher-web` (база `dispatcher-caddy:local`) | `caddy run` | HTTPS, статика SPA из `/srv/admin`, реверс-прокси на `api:3000` |

Все боты используют **один образ** `dispatcher-api` — пересборка `api` обновляет и их.

### Маршруты (deploy/Caddyfile)

| Путь | Куда |
|---|---|
| `/api/*` | `api:3000` |
| `/r/*` | `api:3000` — публичный отчёт клиенту по токену |
| `/media/*` | `api:3000` — фото/видео/голос пруфов |
| `/admin/*` | 302-редирект на тот же путь в корне (legacy-ссылки из старых писем) |
| `/` и всё остальное | SPA (`/srv/admin`, fallback `index.html`) |
| `n8n.putevo.su` | `n8n:5678` (сервис не поднят) |

### Где что хранится

| Данные | Место |
|---|---|
| Заявки, клиенты, водители, смены, пользователи | PostgreSQL, схема `public`, 40 таблиц |
| Токены ботов, ключи DaData/Yandex, адрес базы и полигона, настройки распределения | PostgreSQL, таблица `settings` (ключи `integration_tokens`, `base`, `landfill`, `distribution`, `*_bot_username`) — **редактируются в админке, не в .env** |
| Пароли БД, `AUTH_SECRET`, `SERVICE_TOKEN`, SMTP, суперюзер | `server/.env.production` на сервере (gitignored) |
| `TW_TOKEN` (Timeweb API для DNS-01) | `/opt/dispatcher/.env` (gitignored) |
| Фото/видео/голосовые пруфы | docker volume `dispatcher_media_data` → `/app/media` |
| Сертификаты Let's Encrypt | docker volume `dispatcher_caddy_data` |

### Роли и доступ

`superuser` (скрыт от остальных) → `director` → `manager`. Гарды маршрутов — в `src/App.jsx`,
права на пункты меню — в БД (миграция `044_user_nav_permissions`).

### Схема БД — 40 таблиц

`users`, `companies`, `company_groups`, `company_payments`, `clients`, `objects`, `sections`,
`trusted_persons`, `object_trusted_persons`, `client_recipients`, `client_messages`, `channels`,
`drivers`, `vehicles`, `vehicle_types`, `vehicle_container_types`, `containers`, `container_types`,
`container_movements`, `orders`, `order_items`, `order_item_containers`, `order_subtasks`,
`order_drafts`, `routes`, `route_stops`, `shifts`, `attachments`, `invoices`, `districts`, `streets`,
`settings`, `outbox`, `inbound_messages`, `email_outbox`, `bot_sessions`, `app_sessions`,
`assistant_logs`, `knex_migrations`, `knex_migrations_lock`.

Полный источник истины по схеме — [server/src/migrations/](../server/src/migrations/) (53 файла,
последняя `052_order_item_trusted_person.js`).

### Дополнительная документация в репо

- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md) — общая архитектура
- [CLAUDE.md](../CLAUDE.md) — конвенции фронтенда
- [docs/deploy-timeweb.md](deploy-timeweb.md) — исходная инструкция по деплою (частично устарела: там старый IP и простой стек без TLS)
- [deploy/README.md](../deploy/README.md) — переключение на боевой стек (тоже со старым IP)

---

## 8. Состояние работ на момент паузы

Прод и `main` совпадали на коммите `0b09778`. Последние сделанные блоки:
- Полный адрес объекта из DaData вместо огрызка «Город, д. N» — фронт, рассылка клиенту, оба водительских бота
- Водительский бот: приветствие/прощание по имени + статус смены одним сообщением, статус ✅/⬜, повторный выход на смену в тот же день
- Заявка: доверенное лицо на уровне позиции (миграция 052), справочник «Контейнеры» = только размеры, кубатура в размере
- Клиент: ИНН выше названия, короткое имя из DaData, тип ООО/ИП автоматически, мессенджеры отдельным окном

Не доделано и ждёт возврата:
- **Завершение по действию, а не по участку** — кнопки/пруфы/перенос по каждому действию. План готов, ждали запроса от клиентов.
- **Распределение по накопленным баллам** — этап 1 (показ истории за 7 дней) сделан, этапы 2–3 впереди.
- **Учёт пользователей: биллинг + журнал посещений** — бэкенд готов (миграция 049), фронт нет.
- **Мультитенантность (SaaS)** — начата разделом «Клиенты» у суперюзера и саморегистрацией директора по коду (миграция 043).

Тесты на момент паузы: 232/232 зелёные (`cd server && npm test`).
⚠️ Не запускать два прогона vitest одновременно — они делят схему `dispatcher_test` и бьют друг друга.
