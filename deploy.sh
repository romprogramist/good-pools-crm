#!/usr/bin/env bash
# Применение: на сервере `cd /home/roman/good-pools-crm && bash deploy.sh`.
# Делает: git pull → docker build (worker, app, builder) → prisma migrate
# → seed admin (через builder, у него полные node_modules с tsx и prisma CLI) → restart.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/5] git pull"
git pull --ff-only

echo "==> [2/5] build worker + app + builder"
# --env-file прокидывает NEXT_PUBLIC_* в build args (client-bundle Next.js)
docker compose --env-file .env.production build worker
docker compose --env-file .env.production build app
# Builder-стадия — нужна для миграций и seed, у неё полные node_modules.
# Передаём тот же NEXT_PUBLIC_VAPID_PUBLIC_KEY, чтобы builder-образ имел
# идентичный client-bundle (на случай ad-hoc запусков из него).
set -o allexport; source .env.production; set +o allexport
docker build \
  --target builder \
  --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="$NEXT_PUBLIC_VAPID_PUBLIC_KEY" \
  -t gpcrm-builder . > /dev/null

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
