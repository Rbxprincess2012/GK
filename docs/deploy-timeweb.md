# Деплой бэкенда на Timeweb (Docker)

Цель: поднять бэкенд на Cloud-сервере Timeweb (напр. `85.239.47.178`), подключённый к
managed-PostgreSQL, с публичным URL для n8n и фронта.

## 0. Что понадобится
- Доступ по SSH к серверу Timeweb.
- На сервере установлен **Docker** + **docker compose** (см. шаг 1).
- Пароль БД `gen_user`, секреты `AUTH_SECRET` / `SERVICE_TOKEN` (примеры в `.env.production.example`).

## 1. Подготовка сервера (один раз)
```bash
ssh root@85.239.47.178
# Docker (если ещё нет)
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 2. Доставить код
Вариант git (рекомендую — потом проще обновлять):
```bash
# на сервере
mkdir -p /opt/dispatcher && cd /opt/dispatcher
git clone <URL_РЕПО> .          # или только папку server/
cd server
```
Вариант без git — скопировать папку `server/` с локали:
```bash
# на локальной машине (PowerShell), архивируем без node_modules
scp -r D:\Татьяна\server root@85.239.47.178:/opt/dispatcher/
```

## 3. Заполнить секреты
```bash
cd /opt/dispatcher/server
cp .env.production.example .env.production
nano .env.production       # вписать PGPASSWORD, SUPERUSER_PASSWORD; при желании перегенерировать AUTH_SECRET/SERVICE_TOKEN
```
Перегенерировать секреты при необходимости:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 4. Собрать образ
```bash
docker compose build
```

## 5. Прогнать миграции и завести суперпользователя
```bash
docker compose run --rm api npm run migrate
docker compose run --rm api npm run seed:superuser
```
> База у вас уже с данными (Этап 1/2) — миграции применят только недостающее (идемпотентны по batch).

## 6. Запустить
```bash
docker compose up -d
docker compose logs -f --tail=50      # должно быть "API on :3000"
```

## 7. Проверить снаружи
```bash
curl -s http://85.239.47.178:3000/api/health
curl -s -X POST http://85.239.47.178:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clockerinfo@gmail.com","password":"<ВАШ_ПАРОЛЬ>"}'
```
Открыть порт в фаерволе Timeweb (панель → Брандмауэр) или локально:
```bash
ufw allow 3000/tcp     # если используется ufw
```

## 8. HTTPS (рекомендуется перед боями)
n8n шлёт сервисный токен — лучше по TLS. Нужен домен (A-запись на IP сервера).
Самый простой авто-TLS — **Caddy** как reverse-proxy:

`/opt/dispatcher/Caddyfile`:
```
api.ВАШ_ДОМЕН {
    reverse_proxy localhost:3000
}
```
```bash
docker run -d --name caddy --restart unless-stopped --network host \
  -v /opt/dispatcher/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data caddy:2
```
После этого API доступен по `https://api.ВАШ_ДОМЕН/api/...`, а порт 3000 можно закрыть наружу.
Без домена — временно работаем по `http://IP:3000` (для теста допустимо).

## 9. Связать с n8n и фронтом
- В n8n в HTTP-нодах базовый URL = `https://api.ВАШ_ДОМЕН/api` (или `http://IP:3000/api`),
  заголовок `Authorization: Bearer <SERVICE_TOKEN>` (тот же, что в `.env.production`).
- Фронт: в его `.env` `VITE_API_URL=https://api.ВАШ_ДОМЕН/api`, пересобрать.
  Когда задеплоим фронт — пропишем его домен в `CORS_ORIGIN` бэкенда и перезапустим.

## 10. Обновление версии
```bash
cd /opt/dispatcher/server
git pull                                  # или заново scp
docker compose build
docker compose run --rm api npm run migrate   # если есть новые миграции
docker compose up -d
```

## Безопасность
- `AUTH_SECRET` и `SERVICE_TOKEN` — длинные случайные, не коммитить (`.env.production` в gitignore).
- Сменить пароль `gen_user` в Timeweb (он светился в чате) и обновить `PGPASSWORD`.
- После первого входа сменить пароль суперпользователя.
