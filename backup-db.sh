#!/usr/bin/env bash
# Применение: cron на сервере (см. DEPLOY.md). Дампит БД, ротация 30 дней.
# Пароль читается из ~/.pgpass — создаётся вручную при первом деплое.
set -euo pipefail

BACKUP_DIR=/var/backups/good-pools-crm
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
DUMP="$BACKUP_DIR/db-$TS.dump"

pg_dump -h localhost -U good_pools_crm_user -d good_pools_crm_db -F c -f "$DUMP"

# Ротация: удаляем дампы старше 30 дней
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +30 -delete

echo "[$(date -Iseconds)] backup ok: $DUMP ($(du -h "$DUMP" | cut -f1))"
