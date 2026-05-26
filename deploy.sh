#!/usr/bin/env bash
# Применение: на сервере `cd /home/roman/good-pools-crm && bash deploy.sh`.
# Делает: git pull → docker build (worker, app, builder) → prisma migrate
# → seed admin (через builder, у него полные node_modules с tsx и prisma CLI) → restart.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/5] git pull"
git pull --ff-only

echo "==> [2/5] build worker + app + builder"
# Сначала worker (лёгкий, упадёт раньше — узнаем без долгого билда)
docker compose build worker
docker compose build app
# Builder-стадия — нужна для миграций и seed, у неё полные node_modules
docker build --target builder -t gpcrm-builder . > /dev/null

echo "==> [3/5] prisma migrate deploy (через builder)"
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env.production \
  gpcrm-builder npx prisma migrate deploy

echo "==> [4/5] seed admin (idempotent, через builder)"
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env.production \
  gpcrm-builder npx tsx prisma/seeds/admin.ts

echo "==> [5/5] restart services"
docker compose up -d

echo "==> done"
docker compose ps
