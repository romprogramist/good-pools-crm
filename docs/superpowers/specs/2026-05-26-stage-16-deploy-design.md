# Этап 16. Деплой на тестовый домен — дизайн

**Дата:** 2026-05-26
**Статус:** на согласовании.
**Связано:** `plan.md` этап 16, [[reference-prod-server]].

## Цель

Развернуть CRM на тестовом домене **`gpcrm.95-163-236-186.nip.io`** для демонстрации заказчику. На этом же чекпойнте подтверждаются перенесённые задачи:
- Уровень 2 этапа 15 (живой push-уведомление от cron-задачи)
- iOS PWA с этапа 14 (Add to Home Screen на iPhone через HTTPS)

Это **тестовый** деплой, не production: один пользователь-админ, без SMTP, минимум фич за пределами happy path. Боевой URL компании появится отдельным микроэтапом после фидбека заказчика.

## Контекст сервера

`ssh roman@95.163.236.186`, Ubuntu 20.04, 2 vCPU, 3.8 GB RAM, sudo без пароля. На сервере уже крутится ~15 проектов клиентов — мы добавляем свой так, чтобы **не задеть соседние**. Подробности — [[reference-prod-server]]. Особо: `pool-builder-crm.ru` на сервере — **другой проект**, не наш, не трогаем.

## Архитектура

```
                       Internet (HTTPS)
                            │
                            ▼
                   ┌────────────────────┐
                   │  nginx (host)      │   ← существующий, добавим vhost
                   │  :443              │
                   └─────────┬──────────┘
                             │ proxy_pass http://127.0.0.1:3010
                             ▼
                  ┌──────────────────────┐
                  │  docker-compose      │
                  │  network: gpcrm_net  │
                  │                      │
                  │  ┌────────────────┐  │
                  │  │ app (Next.js)  │  │   :3000 внутри, :3010 на хосте
                  │  │ standalone     │  │
                  │  └───────┬────────┘  │
                  │          │           │
                  │  ┌───────┴────────┐  │
                  │  │ worker (tsx)   │  │   cron-задачи этапа 15
                  │  │ node-cron      │  │
                  │  └────────────────┘  │
                  │                      │
                  └──────────┬───────────┘
                             │ host.docker.internal:5432
                             ▼
                   ┌────────────────────┐
                   │ postgresql@12-main │   ← хостовый, общий с другими
                   │ (host)             │     проектами; новая БД + юзер
                   └────────────────────┘

  bind mounts (хост → контейнеры):
    /home/roman/good-pools-crm/uploads → /app/uploads   (фото, PDF)
    /home/roman/good-pools-crm/.env.production → /app/.env  (read-only)
```

**Принципы:**
- `nginx` и `postgres` — **на хосте**, не в compose. Это адаптация плана под мультипроектный сервер.
- В compose только наши контейнеры (app + worker), всё остальное — переиспользуем.
- Бинды для uploads и .env — состояние живёт на хосте, контейнеры stateless.

## Postgres на хосте

Создаём отдельную БД и юзера, чтобы изолировать от других проектов.

```sql
CREATE USER good_pools_crm_user WITH PASSWORD '<сгенерим>';
CREATE DATABASE good_pools_crm_db OWNER good_pools_crm_user;
GRANT ALL PRIVILEGES ON DATABASE good_pools_crm_db TO good_pools_crm_user;
```

В `pg_hba.conf` для версии 12 на Ubuntu по умолчанию `host all all 127.0.0.1/32 md5` — подключение по паролю с localhost разрешено. Из docker-контейнера ходим по `host.docker.internal` → разрешается через `extra_hosts: ["host.docker.internal:host-gateway"]` в compose. Это резолвится в `172.17.0.1` (адрес docker0 моста), который для postgres выглядит как localhost-сосед. **Проверка** при деплое: `psql -h 172.17.0.1 -U good_pools_crm_user -d good_pools_crm_db` изнутри контейнера.

Если postgres откажется принимать с docker-сети — добавим в `pg_hba.conf`:
```
host    good_pools_crm_db   good_pools_crm_user   172.17.0.0/16   md5
```
и `listen_addresses = '*'` в `postgresql.conf` + reload. **Решаем по факту** при попытке подключения, не превентивно — чтобы не задеть существующие политики.

## Образы Docker

### app (Next.js)

Multi-stage Dockerfile с `output: 'standalone'` в `next.config`:

```dockerfile
# Stage 1: deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Stage 2: builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npx prisma generate && npm run build

# Stage 3: runner (standalone)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

Замечание по RAM: билд `next build` на 3.8 GB сервере с уже занятыми 2.2 GB — рисковано (OOM kill). Митигация: `NODE_OPTIONS=--max-old-space-size=1536` в builder-стадии + **swap-файл 4 ГБ** на сервере (если его ещё нет). Соседние проекты не трогаем — все они в работе. Swap безопасен и обратим (`swapoff` + удалить файл). Если даже со swap билд упадёт — fallback на билд локально + `docker save | ssh ... docker load`, но это последнее средство.

### worker

Отдельный, мелкий Dockerfile (тот же node_modules):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=optional && npx prisma generate
COPY worker ./worker
COPY src ./src
COPY tsconfig.json ./
CMD ["npx", "tsx", "worker/index.ts"]
```

Worker нуждается в `src/lib/push/*`, `src/lib/prisma.ts` (через path-alias `@/`). tsx понимает `paths` из tsconfig.

## docker-compose.yml

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gpcrm-app
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "127.0.0.1:3010:3000"
    volumes:
      - ./uploads:/app/uploads
    extra_hosts:
      - "host.docker.internal:host-gateway"

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    container_name: gpcrm-worker
    restart: unless-stopped
    env_file: .env.production
    volumes:
      - ./uploads:/app/uploads
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - app
```

`ports: 127.0.0.1:3010:3000` — слушаем только loopback, наружу торчит nginx. `restart: unless-stopped` — при ребуте сервера контейнер сам поднимется.

## next.config

Добавим `output: 'standalone'`. Также для серверных server actions нужно, чтобы Next узнавал реальный хост из nginx — это работает «из коробки» через `X-Forwarded-Host`, который мы прокинем в nginx.

## .env.production

Шаблон в репо как `.env.production.example`, реальный `.env.production` создаётся на сервере вручную (не коммитим). Поля:

```
NODE_ENV=production
NEXTAUTH_SECRET=<сгенерим>
NEXTAUTH_URL=https://gpcrm.95-163-236-186.nip.io
DATABASE_URL=postgresql://good_pools_crm_user:<password>@host.docker.internal:5432/good_pools_crm_db

# Push (VAPID — генерируем заново для prod-домена)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:roman@horoshie-basseyny.ru
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<тот же что PUBLIC>

# Admin seed (используется однократно при первом prisma db seed)
ADMIN_EMAIL=roman@horoshie-basseyny.ru
ADMIN_PASSWORD=<сгенерим, юзер сменит в UI>
ADMIN_NAME=Роман

# SMTP — отложено
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Cron
CRON_TZ=Europe/Moscow
DEBUG_PUSH=
```

## Seed админа

Новый скрипт `prisma/seeds/admin.ts`. При первом запуске создаёт пользователя с ролью `admin` из `ADMIN_EMAIL/ADMIN_PASSWORD`. Идемпотентный — если юзер уже есть, ничего не делает (не перезаписывает пароль, чтобы повторные деплои не сбрасывали смену пароля админа).

В `package.json` добавить `"db:seed:admin": "tsx prisma/seeds/admin.ts"`.

В `deploy.sh` вызывается через `docker compose exec app npx tsx prisma/seeds/admin.ts` после миграций.

## nginx vhost

Новый файл на сервере: `/etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf`. В репо положим копию в `deploy/nginx/gpcrm.95-163-236-186.nip.io.conf` для версионирования.

```nginx
server {
    listen 80;
    server_name gpcrm.95-163-236-186.nip.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gpcrm.95-163-236-186.nip.io;

    ssl_certificate /etc/letsencrypt/live/gpcrm.95-163-236-186.nip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gpcrm.95-163-236-186.nip.io/privkey.pem;

    # service worker должен отдаваться с правильным scope (нужен для PWA)
    add_header Service-Worker-Allowed "/" always;

    client_max_body_size 25M;  # фото визитов до 25 МБ — соответствует лимитам в коде

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
```

**`/uploads/` через X-Accel-Redirect:** оригинальный плановый пункт — «защищённая раздача uploads, не напрямую». Реализация: app-роут проверяет права → возвращает заголовок `X-Accel-Redirect: /internal-uploads/...` → nginx отдаёт файл с диска. **Откладываем до полировки** — для тестового деплоя достаточно того, что Next.js сам раздаёт файлы через свои server-actions/route-handlers. Файлы лежат в `/home/roman/good-pools-crm/uploads`, доступ только через app — наружу не торчат, потому что nginx не знает про этот путь.

## Let's Encrypt сертификат

Сертификат на nip.io-субдомен выписывается обычным `certbot --nginx`. Проблема: текущий certbot 0.40 (2019 год) может не поддерживать новые ACME-челленджи; если упадёт — обновим через snap (`snap install --classic certbot`). **Решаем по факту**.

Команда:
```bash
sudo certbot --nginx -d gpcrm.95-163-236-186.nip.io --non-interactive --agree-tos -m roman@horoshie-basseyny.ru
```

Авто-обновление: certbot сам пишет таймер в `/etc/cron.d/certbot` при установке — ничего настраивать не надо.

## deploy.sh

Скрипт лежит в репо, на сервере вызывается как `cd /home/roman/good-pools-crm && bash deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> build images (worker сначала — он лёгкий, если упадёт — узнаем без долгого билда)"
docker compose build worker
docker compose build app

echo "==> apply migrations"
docker compose run --rm app npx prisma migrate deploy

echo "==> seed admin (idempotent)"
docker compose run --rm app npx tsx prisma/seeds/admin.ts

echo "==> restart services"
docker compose up -d

echo "==> done"
docker compose ps
```

`migrate deploy` — production-режим Prisma, накатывает все непрокаченные миграции, не интерактивный.

## backup-db.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/good-pools-crm
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
pg_dump -h localhost -U good_pools_crm_user -d good_pools_crm_db -F c -f "$BACKUP_DIR/db-$TS.dump"

# ротация: оставить 30 дней
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +30 -delete
```

Пароль читается из `~/.pgpass`. Cron:
```
0 2 * * * /home/roman/good-pools-crm/backup-db.sh >> /home/roman/good-pools-crm/backup.log 2>&1
```

Uploads пока **не бэкапим** — на тестовом домене не страшно потерять. Добавим в боевой деплой.

## DEPLOY.md

Документ-инструкция для будущего «системника клиента» (или для меня через полгода). Структура:

1. Что нужно от системника (доступы, DNS, ресурсы)
2. Подготовка сервера (postgres, certbot, nginx-vhost)
3. Первичный деплой (`git clone` → `.env.production` → `bash deploy.sh` → certbot → nginx reload)
4. Обновление (`bash deploy.sh`)
5. Логи и диагностика (`docker compose logs`, `docker compose ps`)
6. Бэкапы (где лежат, как восстановить)
7. Что делать если что-то упало

## Чекпойнт

1. Открываем `https://gpcrm.95-163-236-186.nip.io` в браузере → видим логин-страницу с замком HTTPS.
2. Логинимся как админ (из `ADMIN_EMAIL/ADMIN_PASSWORD`).
3. Заводим тестового клиента, бассейн, оборудование.
4. Подписываемся на push-уведомления в `/settings`.
5. Подкручиваем регламент так чтобы попасть в окно 7 дней (как в локальной проверке этапа 15).
6. На сервере: `sudo -u root docker compose -f /home/roman/good-pools-crm/docker-compose.yml exec worker env CRON_REGULATION="* * * * *" sh -c "node-cron-test"` — или проще: `docker compose exec worker env RUN_ONCE=1 npx tsx worker/index.ts`.
7. Получаем push на телефоне в браузере (десктоп Chrome — обязательно, Android Chrome — обязательно, iOS Safari — желательно).
8. Добавляем на домашний экран Android Chrome → запускается standalone.
9. Добавляем на домашний экран iOS Safari → запускается standalone.

При прохождении пп. 7-9 закрываются также: iOS PWA-чекпойнт этапа 14, уровень 2 этапа 15.

## Что НЕ делаем сейчас (вне scope)

- Бэкап uploads (только БД).
- SMTP — отложено до отдельного этапа.
- X-Accel-Redirect для защищённой раздачи uploads — отложено до полировки.
- Боевой домен компании — отдельный микроэтап после фидбека.
- CI/CD (GitHub Actions деплой) — не нужно, `bash deploy.sh` достаточно.
- Мониторинг (Prometheus/Sentry) — вне MVP.

## Открытые риски

- **RAM на билде:** 3.8 GB с занятыми 2.2 — возможен OOM при первом `next build`. Митигация: добавить swap 4 ГБ + `--max-old-space-size=1536`. Соседние контейнеры **не останавливаем** (все в работе). **Решаем по факту первого билда.**
- **certbot 0.40 старый:** может не пройти challenge. Митигация: обновить через snap. **Решаем по факту.**
- **postgresql@12 + Prisma 7:** Prisma 7 поддерживает Postgres 12-16. Должно работать, но дев-машина на свежем Postgres — теоретически возможны различия в дефолтных значениях. **Митигация:** запускаем `prisma migrate deploy` и `prisma migrate status` — если жалоб нет, всё хорошо.
- **Time zone в worker контейнере:** node-cron использует TZ хоста контейнера. Установим `TZ=Europe/Moscow` в `.env.production` и/или `environment:` в compose.
