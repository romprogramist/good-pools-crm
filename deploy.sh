#!/usr/bin/env bash
# Применение: на сервере `cd /home/roman/good-pools-crm && bash deploy.sh`.
# Делает: git pull → docker build → prisma migrate deploy → seed:admin → restart.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/6] git pull"
git pull --ff-only

echo "==> [2/6] build worker (лёгкий, упадёт раньше — узнаем без долгого билда)"
docker compose build worker

echo "==> [3/6] build app (NODE_OPTIONS=--max-old-space-size=1536 зашит в Dockerfile)"
docker compose build app

echo "==> [4/6] apply migrations"
docker compose run --rm app npx prisma migrate deploy

echo "==> [5/6] seed admin (idempotent, читает ADMIN_* из .env.production)"
docker compose run --rm app node prisma/seeds/admin.cjs

echo "==> [6/6] restart services"
docker compose up -d

echo "==> done"
docker compose ps
