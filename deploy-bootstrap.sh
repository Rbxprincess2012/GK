#!/usr/bin/env bash
# Запуск на сервере Timeweb. Перед этим загрузи dispatcher-server-deploy.tar.gz
# (напр. в /root/) через файловый менеджер панели или scp.
# Использование:  bash deploy-bootstrap.sh [путь_к_архиву]
set -e

APP=/opt/dispatcher/server
TAR="${1:-$HOME/dispatcher-server-deploy.tar.gz}"

# 1) Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Устанавливаю Docker"
  curl -fsSL https://get.docker.com | sh
fi

# 2) Распаковка
mkdir -p "$APP"
if [ -f "$TAR" ]; then
  echo "==> Распаковываю $TAR → $APP"
  tar -xzf "$TAR" -C "$APP"
else
  echo "!! Архив не найден: $TAR"
  echo "   Укажи путь: bash deploy-bootstrap.sh /полный/путь/dispatcher-server-deploy.tar.gz"
  exit 1
fi
cd "$APP"

# 3) Конфиг
if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo ""
  echo "============================================================"
  echo "  Создан .env.production. ОТРЕДАКТИРУЙ секреты:"
  echo "     nano $APP/.env.production"
  echo "  (минимум: PGPASSWORD, SUPERUSER_PASSWORD)"
  echo "  Затем запусти этот скрипт ещё раз — он соберёт и поднимет."
  echo "============================================================"
  exit 0
fi

# 4) Сборка + миграции + суперпользователь + запуск
echo "==> Сборка образа";        docker compose build
echo "==> Миграции БД";          docker compose run --rm api npm run migrate
echo "==> Суперпользователь";    docker compose run --rm api npm run seed:superuser
echo "==> Запуск";               docker compose up -d
echo ""
echo "==> Логи:";                docker compose logs --tail=20 api
echo ""
echo "Проверка локально:  curl http://localhost:3000/api/health"
echo "Снаружи:            curl http://<IP_СЕРВЕРА>:3000/api/health  (открой порт 3000 в брандмауэре Timeweb)"
