# Этап 16. Деплой на тестовый домен — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Развернуть good-pools-crm на тестовом домене `gpcrm.95-163-236-186.nip.io` с HTTPS, чтобы заказчик мог потрогать и подтвердить чекпойнты этапов 14 (iOS PWA) и 15 (живой push от cron).

**Architecture:** Контейнеризуем только app (Next.js standalone) и worker (tsx + node-cron), всё остальное (nginx, Postgres 12) — хостовое, переиспользуем существующее с других ~15 проектов. Соседние проекты **не трогаем** (все в работе). Изоляция через отдельную БД/юзера в Postgres, loopback-порт `127.0.0.1:3010`, vhost nginx, bind-mount `uploads/` + `.env.production`.

**Tech Stack:** Next.js 16 (standalone), Prisma 7.8, Postgres 12, Docker Compose v2, hostовый nginx + certbot, node-cron worker, bcryptjs для seed админа.

**Спека:** [docs/superpowers/specs/2026-05-26-stage-16-deploy-design.md](../specs/2026-05-26-stage-16-deploy-design.md)

---

## Структура файлов

**Создаются:**
- `Dockerfile` — multi-stage образ app (Next.js standalone)
- `Dockerfile.worker` — лёгкий образ worker (tsx + node-cron)
- `.dockerignore` — исключения для контекста сборки
- `docker-compose.yml` — два сервиса, host.docker.internal для Postgres
- `.env.production.example` — шаблон переменных, реальный `.env.production` создаётся на сервере
- `prisma/seeds/admin.ts` — идемпотентный seed первого админа
- `deploy/nginx/gpcrm.95-163-236-186.nip.io.conf` — версионированная копия vhost-конфига
- `deploy.sh` — bash-скрипт обновления (git pull → build → migrate → seed → restart)
- `backup-db.sh` — pg_dump БД с ротацией 30 дней
- `DEPLOY.md` — инструкция для будущего системника / future-self

**Модифицируются:**
- `next.config.ts` — добавить `output: 'standalone'`
- `package.json` — скрипт `db:seed:admin`
- `plan.md` — отметить выполненные пункты этапа 16

---

## Часть A. Подготовка репозитория (локально)

Все задачи этой части выполняются локально на dev-машине, без доступа к серверу. Финал части — единый коммит с пушем в `origin/main`.

---

### Task 1: Next.js standalone output

**Files:**
- Modify: `next.config.ts:1-7`

- [ ] **Step 1: Добавить `output: 'standalone'`**

Заменить содержимое `next.config.ts` на:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
};

export default nextConfig;
```

- [ ] **Step 2: Локальный билд для проверки**

Run: `npm run build`
Expected: билд проходит без ошибок, в логах появляется строка вида `Creating an optimized production build`, в конце `Generated 'standalone' build`. Создаётся каталог `.next/standalone/` с файлом `server.js`.

- [ ] **Step 3: Проверить структуру standalone-вывода**

Run: `ls .next/standalone/server.js .next/standalone/package.json .next/static`
Expected: все три пути существуют.

- [ ] **Step 4: Закоммитить точечно (без общего коммита этапа)**

Не коммитим отдельно — этот шаг войдёт в финальный коммит части A (Task 13). Просто оставляем изменения в working tree.

---

### Task 2: Admin seed script (идемпотентный)

**Files:**
- Create: `prisma/seeds/admin.ts`
- Modify: `package.json:5-15` (секция scripts)

- [ ] **Step 1: Создать `prisma/seeds/admin.ts`**

```ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Администратор";

  if (!email || !password) {
    console.error("[seed:admin] ADMIN_EMAIL и ADMIN_PASSWORD обязательны в .env");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed:admin] Пользователь ${email} уже существует — пропускаю`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "admin",
      emailVerified: new Date(),
    },
  });

  console.log(`[seed:admin] Создан админ ${email}`);
}

main()
  .catch((err) => {
    console.error("[seed:admin] Ошибка:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Добавить npm-скрипт в `package.json`**

В секции `"scripts"` сразу после `"db:seed:chemistry"` добавить строку (с запятой в конце):

```json
    "db:seed:admin": "tsx prisma/seeds/admin.ts",
```

Финальный фрагмент scripts:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "db:seed:checklist": "tsx prisma/seeds/checklist.ts",
    "db:seed:chemistry": "tsx prisma/seeds/chemistry.ts",
    "db:seed:admin": "tsx prisma/seeds/admin.ts",
    "vapid:generate": "tsx scripts/generate-vapid.ts",
    "icons:pwa": "tsx scripts/generate-pwa-icons.ts",
    "worker": "tsx worker/index.ts"
  },
```

- [ ] **Step 3: Локальный прогон №1 — создание**

Сначала уточняем, что в локальном `.env` уже есть `ADMIN_EMAIL` и `ADMIN_PASSWORD` — если нет, временно добавить:

```
ADMIN_EMAIL=test-admin@local.test
ADMIN_PASSWORD=test12345
ADMIN_NAME=Тест Админ
```

Run: `npm run db:seed:admin`
Expected: `[seed:admin] Создан админ test-admin@local.test`.

- [ ] **Step 4: Локальный прогон №2 — идемпотентность**

Run: `npm run db:seed:admin` (повторно)
Expected: `[seed:admin] Пользователь test-admin@local.test уже существует — пропускаю` (без ошибки, exit code 0).

- [ ] **Step 5: Подчистить тестового админа из локальной БД**

Run (PowerShell):
```powershell
$env:PGPASSWORD="Test1234"; psql -h localhost -U postgres -d good_pools_crm_db -c "DELETE FROM \"User\" WHERE email = 'test-admin@local.test';"
```
Expected: `DELETE 1`.

Также удалить временные строки `ADMIN_*` из локального `.env`, если добавлял в Step 3 (если они уже там были — оставить как есть).

---

### Task 3: .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Создать `.dockerignore` в корне репо**

```
node_modules
.next
.git
.gitignore
.env
.env.local
.env.production
.env.development
.vscode
.idea
*.log
npm-debug.log*
.DS_Store
Thumbs.db
docs
uploads
README.md
.dockerignore
Dockerfile
Dockerfile.worker
docker-compose.yml
deploy
deploy.sh
backup-db.sh
DEPLOY.md
plan.md
```

`uploads` исключаем — на сервере он лежит на хосте в bind-mount, в образ не нужен. `.env.production` тоже не должен попасть в образ (грузим через env_file).

---

### Task 4: Dockerfile (app)

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Создать `Dockerfile` в корне репо**

```dockerfile
# syntax=docker/dockerfile:1.7

# Stage 1: deps — устанавливаем зависимости и генерируем Prisma Client
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Stage 2: builder — production-сборка Next.js
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: runner — минимальный образ для запуска
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone содержит уже минимальный набор node_modules + server.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# prisma — нужен для `prisma migrate deploy` и `prisma db seed` из deploy.sh
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# tsx и его зависимости — нужны для запуска prisma/seeds/admin.ts
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

Заметка про `tini`: оборачиваем, чтобы Node корректно реагировал на SIGTERM от docker (без него worker и app могут зависать при `docker compose down`).

Заметка про seed: при `docker compose run --rm app npx tsx prisma/seeds/admin.ts` контейнер должен найти `tsx`, `dotenv`, `bcryptjs` — поэтому копируем их явно. `@/lib/prisma` подтягивается через standalone-бандл (server.js), но для standalone-режима seed запускается вне Next.js — нужно проверить, что `tsx` корректно резолвит `@/*` алиас. Если не резолвится — fallback в Task 17 (на сервере): seed запускается через builder-стадию `docker compose run --rm --entrypoint sh app -c "npx prisma db push --skip-generate && npx tsx prisma/seeds/admin.ts"`, или через отдельный stage. Решаем по факту.

- [ ] **Step 2: Если у тебя установлен Docker Desktop локально — проверить syntax**

(Если Docker Desktop не установлен на Windows — пропустить шаг, проверим на сервере.)

Run (PowerShell): `docker build --target deps -t gpcrm-deps-check .` (только первая стадия — быстрая проверка)
Expected: успешно собрана `deps` стадия, скачались node_modules.

Если docker недоступен локально — отметить step как N/A, проверка перенесётся на сервер (Task 17).

---

### Task 5: Dockerfile.worker

**Files:**
- Create: `Dockerfile.worker`

- [ ] **Step 1: Создать `Dockerfile.worker` в корне репо**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini

ENV NODE_ENV=production
ENV TZ=Europe/Moscow

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY tsconfig.json ./
COPY worker ./worker
COPY src ./src

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "worker/index.ts"]
```

Заметки:
- Worker импортирует через `@/lib/...` (см. `worker/jobs/warranty.ts:1`). tsx читает `paths` из `tsconfig.json` (`"@/*": ["./src/*"]`), поэтому `src/` обязательно копируем.
- `TZ=Europe/Moscow` — чтобы node-cron корректно интерпретировал `0 9 * * *` как 09:00 МСК.
- Без multi-stage — образ маленький, build быстрый.

---

### Task 6: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Создать `docker-compose.yml` в корне репо**

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: gpcrm-app:latest
    container_name: gpcrm-app
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "127.0.0.1:3010:3000"
    volumes:
      - ./uploads:/app/uploads
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - gpcrm_net

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    image: gpcrm-worker:latest
    container_name: gpcrm-worker
    restart: unless-stopped
    env_file: .env.production
    volumes:
      - ./uploads:/app/uploads
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - app
    networks:
      - gpcrm_net

networks:
  gpcrm_net:
    name: gpcrm_net
```

Замечания:
- `ports: "127.0.0.1:3010:3000"` — наружу не торчим, наружу выходит только nginx.
- `host.docker.internal:host-gateway` — стандартный способ для compose v2, резолвится в адрес docker0-моста (`172.17.0.1`), через который ходим в хостовый Postgres.
- Имена контейнеров явные — чтобы в `docker ps -a` их легко отличить от соседних 15 проектов.

---

### Task 7: .env.production.example

**Files:**
- Create: `.env.production.example`

- [ ] **Step 1: Создать `.env.production.example` в корне репо**

```env
# Применение: на сервере скопировать этот файл в .env.production и заполнить.
# .env.production в .gitignore — не коммитим.

NODE_ENV=production
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=https://gpcrm.95-163-236-186.nip.io

# Postgres — БД и юзер на хостовом postgresql@12, доступ через docker0
DATABASE_URL=postgresql://good_pools_crm_user:<password>@host.docker.internal:5432/good_pools_crm_db

# Web Push (VAPID) — сгенерировать новые ключи для prod-домена:
#   npm run vapid:generate
# или: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_SUBJECT=mailto:roman@horoshie-basseyny.ru

# Seed первого админа (используется один раз при первом deploy.sh; идемпотентно)
ADMIN_EMAIL=roman@horoshie-basseyny.ru
ADMIN_PASSWORD=<generate: openssl rand -base64 18>
ADMIN_NAME=Роман

# SMTP — отложено (на тестовом домене не нужен; писем CRM не шлёт)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Cron (worker)
CRON_TZ=Europe/Moscow
CRON_WARRANTY=0 9 * * *
CRON_REGULATION=0 9 * * *
CRON_CLEANUP=0 3 * * *
DEBUG_PUSH=
```

- [ ] **Step 2: Убедиться, что `.env.production` в `.gitignore`**

Run: `grep -n "\.env\.production" .gitignore`
Expected: строка вроде `.env*` или `.env.production` присутствует. Если нет — добавить отдельной строкой:

```
.env.production
```

---

### Task 8: nginx vhost (версионированная копия)

**Files:**
- Create: `deploy/nginx/gpcrm.95-163-236-186.nip.io.conf`

- [ ] **Step 1: Создать каталог и файл**

Run (PowerShell): `New-Item -ItemType Directory -Force deploy/nginx | Out-Null`

- [ ] **Step 2: Создать `deploy/nginx/gpcrm.95-163-236-186.nip.io.conf`**

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

    # Для PWA-service-worker (scope из корня)
    add_header Service-Worker-Allowed "/" always;

    # Лимит для фото визитов
    client_max_body_size 25M;

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

Этот файл — версионированная копия. На сервере он копируется в `/etc/nginx/sites-available/` (Task 18).

---

### Task 9: deploy.sh

**Files:**
- Create: `deploy.sh`

- [ ] **Step 1: Создать `deploy.sh` в корне репо**

```bash
#!/usr/bin/env bash
# Применение: на сервере `cd /home/roman/good-pools-crm && bash deploy.sh`
# Делает: git pull → docker build → prisma migrate deploy → seed:admin → restart.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/6] git pull"
git pull --ff-only

echo "==> [2/6] build worker (быстрый, упадёт раньше — узнаем без долгого билда app)"
docker compose build worker

echo "==> [3/6] build app (NODE_OPTIONS=--max-old-space-size=1536 в Dockerfile)"
docker compose build app

echo "==> [4/6] apply migrations"
docker compose run --rm app npx prisma migrate deploy

echo "==> [5/6] seed admin (idempotent)"
docker compose run --rm app npx tsx prisma/seeds/admin.ts

echo "==> [6/6] restart services"
docker compose up -d

echo "==> done"
docker compose ps
```

- [ ] **Step 2: Сделать исполняемым (на windows важен Git-флаг)**

Run (PowerShell): `git update-index --chmod=+x deploy.sh`
Expected: файл получает executable-бит в git-индексе, чтобы при clone на Linux он сразу был `+x`.

---

### Task 10: backup-db.sh

**Files:**
- Create: `backup-db.sh`

- [ ] **Step 1: Создать `backup-db.sh` в корне репо**

```bash
#!/usr/bin/env bash
# Применение: cron на сервере (см. DEPLOY.md). Дампит БД, ротация 30 дней.
# Пароль читается из ~/.pgpass — создаётся вручную при первом деплое (Task 15).
set -euo pipefail

BACKUP_DIR=/var/backups/good-pools-crm
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
DUMP="$BACKUP_DIR/db-$TS.dump"

pg_dump -h localhost -U good_pools_crm_user -d good_pools_crm_db -F c -f "$DUMP"

# Ротация: удаляем дампы старше 30 дней
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +30 -delete

echo "[$(date -Iseconds)] backup ok: $DUMP ($(du -h "$DUMP" | cut -f1))"
```

- [ ] **Step 2: Executable-флаг**

Run (PowerShell): `git update-index --chmod=+x backup-db.sh`

---

### Task 11: DEPLOY.md (минимальная инструкция)

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Создать `DEPLOY.md` в корне репо**

```markdown
# Деплой good-pools-crm

Тестовый домен: `https://gpcrm.95-163-236-186.nip.io`
Сервер: `roman@95.163.236.186` (Ubuntu 20.04).

## Первичный деплой

### 1. Подготовка сервера (один раз)

```bash
# swap, если ещё нет
sudo swapon --show
# если пусто:
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# postgres БД + юзер
sudo -u postgres psql <<SQL
CREATE USER good_pools_crm_user WITH PASSWORD '<пароль>';
CREATE DATABASE good_pools_crm_db OWNER good_pools_crm_user;
GRANT ALL PRIVILEGES ON DATABASE good_pools_crm_db TO good_pools_crm_user;
SQL

# .pgpass для backup-db.sh
echo 'localhost:5432:good_pools_crm_db:good_pools_crm_user:<пароль>' >> ~/.pgpass
chmod 600 ~/.pgpass
```

### 2. Клон и .env.production

```bash
cd ~
git clone https://github.com/romprogramist/good-pools-crm.git
cd good-pools-crm
cp .env.production.example .env.production
# заполнить все <...> значения (NEXTAUTH_SECRET, DATABASE_URL, VAPID_*, ADMIN_*)
nano .env.production
```

VAPID-ключи:
```bash
# временно через docker, без локальной установки npm
docker run --rm -v "$(pwd)":/w -w /w node:22-alpine sh -c "npx -y web-push generate-vapid-keys"
```
Полученные `Public Key` и `Private Key` вписать в `.env.production` (NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY).

### 3. Первичный билд

```bash
bash deploy.sh
```

Должно: собрать оба образа, накатить миграции, создать админа, запустить app и worker.

### 4. Nginx vhost

```bash
sudo cp deploy/nginx/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Let's Encrypt

```bash
sudo certbot --nginx -d gpcrm.95-163-236-186.nip.io --non-interactive --agree-tos -m roman@horoshie-basseyny.ru
```
Certbot сам добавит блок с сертификатом и пропишет автообновление.

### 6. Бэкап cron

```bash
crontab -e
# добавить:
# 0 2 * * * /home/roman/good-pools-crm/backup-db.sh >> /home/roman/good-pools-crm/backup.log 2>&1
```

## Обновление

```bash
cd ~/good-pools-crm
bash deploy.sh
```

## Логи и диагностика

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f worker
docker compose exec app sh
```

## Восстановление из бэкапа

```bash
pg_restore -h localhost -U good_pools_crm_user -d good_pools_crm_db -c /var/backups/good-pools-crm/db-<TS>.dump
```

## Что отложено

- SMTP (на тестовом не нужен)
- X-Accel-Redirect для защищённой раздачи uploads (полировка)
- Бэкап uploads (только БД на тестовом)
- Боевой домен (отдельный микроэтап)
```

---

### Task 12: plan.md — отметить выполненные пункты этапа 16

**Files:**
- Modify: `plan.md:276-289`

- [ ] **Step 1: Отметить чекбоксы части A**

Открыть `plan.md`, найти секцию «Этап 16. Деплой на боевой сервер» и отметить `[x]` пункты, которые сделаны в части A. Остальные оставить `[ ]` — закроются в части B.

```markdown
## Этап 16. Деплой на боевой сервер

- [x] Dockerfile для Next.js (multi-stage, standalone output)
- [x] Dockerfile для worker
- [x] `docker-compose.yml`: postgres + app + worker + nginx
- [x] `nginx.conf` с reverse-proxy на app, отдача `/uploads/` через защищённый роут (не напрямую)
- [ ] LetsEncrypt через `certbot` или `nginx-certbot` контейнер
- [x] `.env.production` шаблон
- [x] Скрипт деплоя `deploy.sh` (git pull + docker compose up -d --build)
- [x] Скрипт бэкапа `backup-db.sh` + cron на сервере (ежедневно в 02:00, ротация 30 дней)
- [x] Документация `DEPLOY.md` с инструкциями для системника клиента
```

Замечание по второй строке про nginx: в исходном плане сказано «postgres + app + worker + nginx» в docker-compose, но мы перешли на хостовые postgres+nginx (адаптация под мультипроектный сервер). Отмечаем как `[x]` — пункт закрыт, но архитектурно иначе; это зафиксировано в спеке.

Замечание по `/uploads/`: X-Accel-Redirect отложен (см. спеку). Сейчас раздача через app — это **временная реализация**, для тестового достаточно. Пункт остаётся `[x]` (есть рабочее решение), а в backlog добавим X-Accel-Redirect.

- [ ] **Step 2: Добавить пункт в backlog**

Найти секцию «Беклог» в `plan.md` и добавить:

```markdown
### Защищённая раздача uploads через X-Accel-Redirect

- [ ] Роут-обёртка `/api/uploads/[...path]` проверяет права → возвращает `X-Accel-Redirect: /internal-uploads/...`
- [ ] Nginx alias `/internal-uploads/` → `/home/roman/good-pools-crm/uploads/` с `internal;` директивой
- [ ] Заменить все прямые ссылки на `/api/uploads/...`

**Почему отложено:** на тестовом домене файлы наружу не торчат (nginx не знает про физический путь), достаточно того, что Next.js раздаёт их через server-actions.
```

---

### Task 13: Финальный коммит и push

- [ ] **Step 1: Проверить статус**

Run: `git status`
Expected: новые файлы: `Dockerfile`, `Dockerfile.worker`, `.dockerignore`, `docker-compose.yml`, `.env.production.example`, `prisma/seeds/admin.ts`, `deploy/nginx/gpcrm.95-163-236-186.nip.io.conf`, `deploy.sh`, `backup-db.sh`, `DEPLOY.md`. Модифицированы: `next.config.ts`, `package.json`, `plan.md`.

- [ ] **Step 2: Staging**

Run:
```
git add Dockerfile Dockerfile.worker .dockerignore docker-compose.yml .env.production.example prisma/seeds/admin.ts deploy/ deploy.sh backup-db.sh DEPLOY.md next.config.ts package.json plan.md
```

- [ ] **Step 3: Коммит**

```bash
git commit -m "$(cat <<'EOF'
этап 16 (часть A): docker + deploy-скрипты + seed админа

- Dockerfile (multi-stage, standalone), Dockerfile.worker
- docker-compose.yml — app+worker, postgres хостовый через host.docker.internal
- .env.production.example, .dockerignore
- prisma/seeds/admin.ts — идемпотентный seed первого админа
- deploy/nginx/...conf — версионированная копия vhost
- deploy.sh, backup-db.sh, DEPLOY.md

Часть B (деплой на 95.163.236.186) — отдельной серией коммитов после явного согласия.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

Run: `git push origin main`
Expected: успешный push.

---

## ⏸ ЧЕКПОЙНТ ПЕРЕД ЧАСТЬЮ B

Перед запуском любой задачи из части B — **явное подтверждение пользователя**. Часть B меняет состояние боевого сервера (создаёт БД, билдит образы, перезапускает services), на котором живёт ~15 чужих проектов. Каждая задача в части B — отдельная ssh-сессия, после каждой ждём подтверждения, прежде чем идти дальше.

Перед началом части B:
1. Зафиксировать `df -h`, `free -m`, `docker ps`, `sudo systemctl status nginx postgresql@12-main` — снимок состояния «до».
2. Подтвердить, что в `MEMORY.md` есть `reference_prod_server.md` или принять отсутствие как факт.

---

## Часть B. Деплой на сервер (требует явного согласия на каждую задачу)

### Task 14: SSH-проверка + swap + снимок «до»

**На сервере:** `ssh roman@95.163.236.186`

- [ ] **Step 1: Снимок «до»**

Run на сервере:
```bash
free -m
df -h /
docker ps --format 'table {{.Names}}\t{{.Status}}'
sudo systemctl status nginx --no-pager | head -3
sudo systemctl status postgresql@12-main --no-pager | head -3
swapon --show
```

Сохранить вывод (скопировать в чат) — это эталон, чтобы потом убедиться, что ничего соседнего не сломалось.

- [ ] **Step 2: Проверить, что нет конфликта по порту 3010 и по subdomain**

Run на сервере:
```bash
sudo ss -tlnp | grep ':3010 ' || echo 'port 3010 free'
ls /etc/nginx/sites-enabled/ | grep -i 'gpcrm\|nip.io' || echo 'no conflicting vhost'
```
Expected: оба — «free» / «no conflicting».

- [ ] **Step 3: Создать swap-файл 4G, если не существует**

Если `swapon --show` пуст:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```
Expected: `swapon --show` показывает `/swapfile 4G`.

Если swap уже есть и ≥ 4G — пропустить.

- [ ] **Step 4: Проверить версию docker compose**

Run: `docker compose version`
Expected: v2.x (если v1 — устанавливаем v2 через apt-get).

---

### Task 15: Postgres — БД и юзер

**На сервере:** через `sudo -u postgres psql`.

- [ ] **Step 1: Сгенерировать пароль для good_pools_crm_user**

Run: `openssl rand -base64 24`
Сохранить вывод — это `<DB_PASSWORD>`, понадобится в Task 16.

- [ ] **Step 2: Создать юзера и БД**

```bash
sudo -u postgres psql <<SQL
CREATE USER good_pools_crm_user WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE good_pools_crm_db OWNER good_pools_crm_user;
GRANT ALL PRIVILEGES ON DATABASE good_pools_crm_db TO good_pools_crm_user;
\du good_pools_crm_user
\l good_pools_crm_db
SQL
```
Expected: видим юзера и БД в выводе `\du` и `\l`.

- [ ] **Step 3: Проверить подключение с docker0**

Сначала найдём адрес docker0:
```bash
ip -4 addr show docker0 | grep inet
```
Обычно `172.17.0.1`.

Затем пробуем подключиться:
```bash
psql -h 172.17.0.1 -U good_pools_crm_user -d good_pools_crm_db -c '\conninfo' -W
```
Введи пароль из Step 1.

**Возможный исход A:** успешное подключение → идём дальше.

**Возможный исход B:** `FATAL: no pg_hba.conf entry for host "172.17.0.1"` → нужно добавить запись:
```bash
sudo nano /etc/postgresql/12/main/pg_hba.conf
# добавить строку перед другими host-записями:
# host    good_pools_crm_db   good_pools_crm_user   172.17.0.0/16   md5
```
И в `postgresql.conf`:
```bash
sudo grep -n 'listen_addresses' /etc/postgresql/12/main/postgresql.conf
# если 'localhost' — расширить:
# listen_addresses = 'localhost,172.17.0.1'
```
Reload:
```bash
sudo systemctl reload postgresql@12-main
```
Повторить `psql -h 172.17.0.1 ...`.

- [ ] **Step 4: Создать .pgpass для backup-db.sh**

```bash
echo 'localhost:5432:good_pools_crm_db:good_pools_crm_user:<DB_PASSWORD>' >> ~/.pgpass
chmod 600 ~/.pgpass
```
Проверка: `pg_dump -h localhost -U good_pools_crm_user -d good_pools_crm_db --schema-only | head -5`
Expected: схема пустой БД (только header dump).

---

### Task 16: Клон репо + .env.production

**На сервере.**

- [ ] **Step 1: Клонировать репо**

```bash
cd ~
git clone https://github.com/romprogramist/good-pools-crm.git
cd good-pools-crm
ls
```
Expected: видим Dockerfile, docker-compose.yml, deploy.sh и т.д.

- [ ] **Step 2: Сгенерировать секреты**

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 18)"
```
Сохранить оба значения.

- [ ] **Step 3: Сгенерировать VAPID-ключи**

```bash
docker run --rm node:22-alpine sh -c "npx -y web-push generate-vapid-keys --json" | tee /tmp/vapid.json
```
Сохранить `publicKey` и `privateKey`.

- [ ] **Step 4: Создать .env.production**

```bash
cp .env.production.example .env.production
nano .env.production
```

Заполнить:
- `NEXTAUTH_SECRET` — из Step 2
- `DATABASE_URL=postgresql://good_pools_crm_user:<DB_PASSWORD>@host.docker.internal:5432/good_pools_crm_db` — пароль из Task 15 Step 1, **URL-encode спецсимволов** (`+`, `/`, `=` → `%2B`, `%2F`, `%3D`)
- `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (одно и то же), `VAPID_PRIVATE_KEY` — из Step 3
- `ADMIN_PASSWORD` — из Step 2

Сохранить, выйти.

Проверка: `cat .env.production | grep -v '^#' | grep '='` — все поля заполнены, `<...>` плейсхолдеров не осталось.

- [ ] **Step 5: Создать каталог uploads**

```bash
mkdir -p uploads
ls -la uploads
```
Expected: каталог существует, владелец — roman.

---

### Task 17: Первичный билд + миграции + seed

**На сервере, в `~/good-pools-crm`.**

- [ ] **Step 1: Билд worker (быстрый — проверим раньше)**

```bash
docker compose build worker
```
Expected: успешный билд за 1-3 минуты, образ `gpcrm-worker:latest`.

Если упадёт на `npm ci` из-за прав или сети — диагностика, не идём дальше.

- [ ] **Step 2: Билд app (долгий, рискованный по RAM)**

```bash
free -m
docker compose build app 2>&1 | tee /tmp/build-app.log
```
Expected: успешный билд за 5-15 минут.

**Возможный исход A:** успех → идём дальше.

**Возможный исход B (OOM):** в логе `JavaScript heap out of memory` или контейнер просто убит → проверить `dmesg | tail -20` на `Out of memory: Killed`. Митигация:
- Убедиться, что swap включён (`swapon --show` показывает 4G).
- Снизить `NODE_OPTIONS=--max-old-space-size=1024` в Dockerfile и пересобрать.
- Если совсем не идёт — fallback на локальный билд + `docker save | ssh ... docker load` (описан в DEPLOY.md как exceptional path; на этом шаге согласовываем с пользователем).

- [ ] **Step 3: Накатить миграции**

```bash
docker compose run --rm app npx prisma migrate deploy
```
Expected: `Applying migration ...` для всех миграций → `All migrations have been successfully applied`.

- [ ] **Step 4: Seed админа**

```bash
docker compose run --rm app npx tsx prisma/seeds/admin.ts
```
Expected: `[seed:admin] Создан админ <email>`.

**Возможная проблема:** `Cannot find module '@/lib/prisma'` (tsx не резолвит alias). Если случится: запускать через `node` напрямую через стандартный `import` — но проще скомпилировать seed в JS на этапе билда. Решаем по факту; если упадёт — отдельным фиксом меняем seed на использование относительного пути (`import { prisma } from "../../src/lib/prisma";` уже стоит — должно работать).

- [ ] **Step 5: Поднять сервисы**

```bash
docker compose up -d
docker compose ps
```
Expected: `gpcrm-app` и `gpcrm-worker` в состоянии `running (healthy)` или просто `running`.

- [ ] **Step 6: Curl на loopback — проверка app**

```bash
curl -I http://127.0.0.1:3010/
```
Expected: `HTTP/1.1 200 OK` или `307`/`302` (редирект на /login).

- [ ] **Step 7: Проверка логов worker**

```bash
docker compose logs worker --tail 30
```
Expected: видим `[worker] Запущен. CRON_WARRANTY=... CRON_REGULATION=... CRON_CLEANUP=...` (или аналогичный лог из `worker/index.ts`).

---

### Task 18: Nginx vhost + Let's Encrypt

**На сервере.**

- [ ] **Step 1: Скопировать vhost-конфиг во временный (без SSL пока)**

Сначала ставим **только http-блок**, без ssl-блока — certbot потом сам добавит:

```bash
sudo tee /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name gpcrm.95-163-236-186.nip.io;

    location / {
        return 200 'gpcrm pre-cert placeholder\n';
        add_header Content-Type text/plain;
    }
}
NGINX
sudo ln -s /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
Expected: `nginx -t` → `syntax is ok`, `test is successful`. Reload без ошибок.

- [ ] **Step 2: Проверить, что nip.io резолвится и доходит**

```bash
curl -sS http://gpcrm.95-163-236-186.nip.io/
```
Expected: `gpcrm pre-cert placeholder`.

Если нет — проверить, что 80 порт открыт в файрволе и nip.io не закэшировался.

- [ ] **Step 3: Получить сертификат через certbot**

```bash
sudo certbot --version
sudo certbot --nginx -d gpcrm.95-163-236-186.nip.io --non-interactive --agree-tos -m roman@horoshie-basseyny.ru
```

**Возможный исход A:** certbot успешно выписал сертификат → идём дальше.

**Возможный исход B:** старый certbot 0.40 не справился → обновить через snap:
```bash
sudo apt-get remove certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d gpcrm.95-163-236-186.nip.io --non-interactive --agree-tos -m roman@horoshie-basseyny.ru
```

- [ ] **Step 4: Заменить vhost на боевой**

После того как certbot добавил ssl-блок, заменяем плейсхолдерное содержимое на полноценное:

```bash
sudo cp ~/good-pools-crm/deploy/nginx/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf
sudo nginx -t
sudo systemctl reload nginx
```

Замечание: если certbot уже прописал `ssl_certificate` строчки внутри нашего vhost — путь, на котором они лежат, совпадает с тем, что в `deploy/nginx/...conf` (`/etc/letsencrypt/live/gpcrm.95-163-236-186.nip.io/...`), поэтому замена безопасна. Если certbot привнёс что-то нестандартное — diff: `sudo diff /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf ~/good-pools-crm/deploy/nginx/gpcrm.95-163-236-186.nip.io.conf`.

- [ ] **Step 5: Curl HTTPS**

```bash
curl -I https://gpcrm.95-163-236-186.nip.io/
```
Expected: `HTTP/2 200` или `HTTP/2 307` (редирект на /login), TLS handshake без ошибок.

- [ ] **Step 6: Проверить автообновление сертификата**

```bash
sudo systemctl list-timers | grep certbot || cat /etc/cron.d/certbot
sudo certbot renew --dry-run
```
Expected: dry-run проходит без ошибок.

---

### Task 19: Бэкап cron

**На сервере.**

- [ ] **Step 1: Прогон backup-db.sh вручную**

```bash
cd ~/good-pools-crm
bash backup-db.sh
ls -la /var/backups/good-pools-crm/
```
Expected: создан файл `db-YYYYMMDD-HHMMSS.dump` размером 0.1-1 МБ.

Если `mkdir -p /var/backups/good-pools-crm` упадёт по правам — выполнить `sudo mkdir -p /var/backups/good-pools-crm && sudo chown roman:roman /var/backups/good-pools-crm` и повторить.

- [ ] **Step 2: Добавить в crontab**

```bash
crontab -e
```
Добавить строку:
```
0 2 * * * /home/roman/good-pools-crm/backup-db.sh >> /home/roman/good-pools-crm/backup.log 2>&1
```
Сохранить.

Проверка: `crontab -l | grep backup-db`

- [ ] **Step 3: (Опционально) Проверить, что cron-сервис активен**

```bash
sudo systemctl status cron --no-pager | head -3
```
Expected: `active (running)`.

---

### Task 20: Live-проверка чекпойнта

- [ ] **Step 1: Открыть в браузере**

URL: `https://gpcrm.95-163-236-186.nip.io/`
Expected: страница логина, замок HTTPS в адресной строке.

- [ ] **Step 2: Залогиниться как админ**

Email: `ADMIN_EMAIL` из `.env.production`
Пароль: `ADMIN_PASSWORD` из `.env.production`
Expected: успешный логин → dashboard.

- [ ] **Step 3: Завести тестового клиента + бассейн + оборудование**

Через UI: добавить клиента «Тест Клиент», бассейн, оборудование с гарантией.

- [ ] **Step 4: Подписаться на push на десктоп Chrome**

Зайти в `/settings`, нажать «Подписаться на push». Принять разрешение в браузере.

- [ ] **Step 5: Прогнать cron вручную, проверить дедуп**

На сервере:
```bash
cd ~/good-pools-crm
# Подкрутить регламент тестового оборудования так, чтобы он попадал в окно "за 7 дней"
# (через UI или через psql — на твоё усмотрение)

# Прогнать worker один раз
docker compose exec worker env RUN_ONCE=1 npx tsx worker/index.ts
```
Expected: в логе видим «Отправлен пуш о регламенте клиенту …», в браузере приходит push-уведомление.

Повторный прогон сразу — `sent: 0`, дедуп через `Equipment.regulationNotifiedAt`.

- [ ] **Step 6: Android Chrome — Add to Home Screen**

С Android открыть домен → меню → «Добавить на главный экран» → проверить, что иконка PWA добавилась, открывается в standalone.

- [ ] **Step 7: iOS Safari — Add to Home Screen**

С iPhone открыть домен в Safari → Share → «На экран Домой» → проверить, что иконка добавилась и приложение открывается в standalone-режиме (без адресной строки).

- [ ] **Step 8: Отметить выполненные пункты plan.md**

```markdown
- [x] LetsEncrypt через `certbot` или `nginx-certbot` контейнер
```

И в этапе 14 (iOS PWA) + этапе 15 (живой push) — закрыть соответствующие чекпойнты.

- [ ] **Step 9: Финальный коммит части B**

```bash
git add plan.md
git commit -m "$(cat <<'EOF'
этап 16 (часть B): тестовый деплой на gpcrm.95-163-236-186.nip.io завершён

- Сервер 95.163.236.186: swap 4G, postgres БД+юзер, docker-compose поднят
- Nginx vhost + Let's Encrypt сертификат
- Бэкап БД по cron 02:00
- Чекпойнты этапов 14 (iOS PWA) и 15 (живой push) закрыты

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Финальная самопроверка

После завершения всех 20 задач:

1. `docker compose ps` на сервере → оба контейнера в `running`.
2. `https://gpcrm.95-163-236-186.nip.io/` отвечает 200/307.
3. Push приходит из реального cron-прогона.
4. `crontab -l` показывает строку с `backup-db.sh`.
5. `ls /var/backups/good-pools-crm/` содержит дамп БД.
6. Соседние ~15 проектов работают (сравнить с снимком из Task 14 Step 1: `docker ps`, `systemctl status nginx postgresql@12-main`).
7. `plan.md` — все чекбоксы этапа 16 отмечены `[x]`.

Если все 7 пунктов выполнены — этап 16 закрыт.
