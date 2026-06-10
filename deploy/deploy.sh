#!/usr/bin/env bash
# Pull-деплой прода. Безопасен для запуска по cron каждые N минут:
# пересборка и перезапуск происходят ТОЛЬКО когда в origin/main появились новые коммиты.
# Запуск вручную:  bash deploy/deploy.sh   (или из cron — см. docs)
set -euo pipefail
cd "$(dirname "$0")/.."   # → корень репозитория (/opt/dispatcher)

git fetch --quiet --all
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # изменений нет — тихо выходим (важно для частого cron)
fi

echo "== Новые коммиты: $LOCAL -> $REMOTE =="
git reset --hard origin/main

# Caddy с DNS-плагином собираем ТОЛЬКО если образа ещё нет (редкая операция ~13 мин).
if ! docker image inspect dispatcher-caddy:local >/dev/null 2>&1; then
  echo '== Сборка Caddy с DNS-плагином (разово) =='
  docker build -t dispatcher-caddy:local -f deploy/Dockerfile.caddy .
fi

echo '== Сборка образов (api + web; bot использует образ api) =='
docker compose -f docker-compose.prod.yml build api web

echo '== Миграции БД (идемпотентно) =='
docker compose -f docker-compose.prod.yml run --rm api npm run migrate

echo '== Перезапуск сервисов (без n8n) =='
docker compose -f docker-compose.prod.yml up -d api bot web

docker compose -f docker-compose.prod.yml ps
echo '== Деплой завершён =='
