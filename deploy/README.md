# Боевой стек (HTTPS + n8n) — переключение

Сейчас сервер работает на простом стеке `server/docker-compose.yml` (только `api`, порт 3000, без TLS).
Когда домен **putevo.su** активен и DNS указывает на сервер, переключаемся на боевой стек
`docker-compose.prod.yml` (Caddy с авто-HTTPS + админка под `/admin` + n8n).

## Предусловия
- A-записи `putevo.su` и `n8n.putevo.su` (или `*`) → `217.149.30.139`, DNS прогрелся.
- Порты **80** и **443** открыты (фаервол Timeweb выключен — ок).

## Переключение (на сервере, из `/opt/dispatcher`)

```bash
# 0. Остановить старый стек (он держит порт 3000; Caddy займёт 80/443)
docker compose -f server/docker-compose.yml down

# 1. Конфиг n8n
cp server/.env.n8n.example server/.env.n8n
# сгенерировать ключ и вписать N8N_ENCRYPTION_KEY:
#   openssl rand -hex 24
nano server/.env.n8n

# 2. Собрать и поднять боевой стек
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm api npm run migrate
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs --tail=30
```

Caddy при первом старте сам выпустит сертификаты Let's Encrypt (нужны живые A-записи + 80/443).

## Проверка
- `https://putevo.su/api/health` → `{"ok":true}`
- `https://putevo.su/admin` → админка (логин суперюзера)
- `https://n8n.putevo.su` → мастер создания владельца n8n

## После переключения
- Локальный фронт (`.env.local`) перенаправить на прод API:
  `VITE_API_URL=https://putevo.su/api`
- В `server/.env.production` задать `CORS_ORIGIN=https://putevo.su` (не обязательно — админка
  на том же домене, но не повредит).
- Обновить авто-деплой: в `/opt/dispatcher/deploy.sh` заменить строки сборки/запуска на
  `docker compose -f docker-compose.prod.yml ...` (см. ниже), чтобы `git push` катил весь стек.

### Авто-деплой для боевого стека (`/opt/dispatcher/deploy.sh`)
После `git reset --hard origin/main`:
```bash
docker compose -f /opt/dispatcher/docker-compose.prod.yml build
docker compose -f /opt/dispatcher/docker-compose.prod.yml run --rm api npm run migrate
docker compose -f /opt/dispatcher/docker-compose.prod.yml up -d
```
