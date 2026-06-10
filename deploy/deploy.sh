#!/usr/bin/env bash
# Pull-деплой прода. Безопасен для запуска по cron каждые N минут.
# Сервер пуллит ветку `deploy` (НЕ main): туда коммит попадает только после
# зелёного CI (.github/workflows/ci.yml промоутит main -> deploy). Сломанный код
# на прод не доходит. Пересборка происходит ТОЛЬКО при новом коммите в origin/deploy.
# Запуск вручную:  bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # → корень репозитория (/opt/dispatcher)

git fetch --quiet --all
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/deploy)
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # изменений нет — тихо выходим (важно для частого cron)
fi

echo "== Новые коммиты: $LOCAL -> $REMOTE =="
git reset --hard origin/deploy

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
