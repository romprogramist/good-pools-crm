# Деплой good-pools-crm

Тестовый домен: `https://gpcrm.95-163-236-186.nip.io`
Сервер: `roman@95.163.236.186` (Ubuntu 20.04).

Сервер мультипроектный — на нём крутится ~15 чужих проектов. **Соседние контейнеры/vhost-конфиги не трогаем.**

## Первичный деплой

### 1. Подготовка сервера (один раз)

```bash
# Swap 4G, если ещё нет
sudo swapon --show
# если пусто:
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Postgres БД + юзер (хостовый postgresql@12-main)
sudo -u postgres psql <<SQL
CREATE USER good_pools_crm_user WITH PASSWORD '<пароль>';
CREATE DATABASE good_pools_crm_db OWNER good_pools_crm_user;
GRANT ALL PRIVILEGES ON DATABASE good_pools_crm_db TO good_pools_crm_user;
SQL

# .pgpass для backup-db.sh
echo 'localhost:5432:good_pools_crm_db:good_pools_crm_user:<пароль>' >> ~/.pgpass
chmod 600 ~/.pgpass
```

Если Postgres откажет docker-сети при первом коннекте — добавить в `/etc/postgresql/12/main/pg_hba.conf`:
```
host    good_pools_crm_db   good_pools_crm_user   172.17.0.0/16   md5
```
и в `postgresql.conf`: `listen_addresses = 'localhost,172.17.0.1'`. Затем `sudo systemctl reload postgresql@12-main`.

### 2. Клон и `.env.production`

```bash
cd ~
git clone https://github.com/romprogramist/good-pools-crm.git
cd good-pools-crm
mkdir -p uploads
cp .env.production.example .env.production
nano .env.production
```

Заполнить все `<...>` значения:
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `DATABASE_URL` — пароль из шага 1 (если есть спецсимволы — URL-encode)
- `ADMIN_PASSWORD` — `openssl rand -base64 18`
- VAPID-ключи — `docker run --rm node:22-alpine sh -c "npx -y web-push generate-vapid-keys --json"`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `VAPID_PUBLIC_KEY`.

### 3. Первичный билд и запуск

```bash
bash deploy.sh
```

Сделает: билд обоих образов → миграции → seed админа → `docker compose up -d`.

При OOM на билде app проверить swap (`swapon --show`); если совсем не идёт — fallback: билд локально на машине разработчика + `docker save gpcrm-app:latest | gzip | ssh roman@... 'gunzip | docker load'`.

### 4. Nginx vhost + Let's Encrypt

```bash
# Временный конфиг без SSL (чтобы certbot мог пройти http-challenge)
sudo tee /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name gpcrm.95-163-236-186.nip.io;
    location / { return 200 'gpcrm pre-cert placeholder\n'; add_header Content-Type text/plain; }
}
NGINX
sudo ln -s /etc/nginx/sites-available/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Сертификат
sudo certbot --nginx -d gpcrm.95-163-236-186.nip.io --non-interactive --agree-tos -m roman@horoshie-basseyny.ru

# Если certbot 0.40 не справится — переустановить через snap:
#   sudo apt-get remove certbot
#   sudo snap install --classic certbot
#   sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Боевой конфиг (с проксированием на app)
sudo cp ~/good-pools-crm/deploy/nginx/gpcrm.95-163-236-186.nip.io.conf /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
```

Авто-обновление сертификата: certbot сам прописывает timer/cron при установке.

### 5. Бэкап cron

```bash
crontab -e
```
Добавить:
```
0 2 * * * /home/roman/good-pools-crm/backup-db.sh >> /home/roman/good-pools-crm/backup.log 2>&1
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

- SMTP (на тестовом не нужен — писем CRM не шлёт).
- X-Accel-Redirect для защищённой раздачи uploads (полировка).
- Бэкап uploads (только БД на тестовом).
- Боевой домен компании — отдельный микроэтап после фидбека заказчика.
