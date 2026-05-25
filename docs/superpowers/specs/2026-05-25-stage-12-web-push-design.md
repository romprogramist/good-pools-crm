# Этап 12. Web Push — дизайн

**Статус:** утверждён к реализации (брейншторм 2026-05-25, Роман).
**Связанные документы:** `plan.md` этап 12, `spec.md` разделы «Уведомления» и «Технические решения».
**Предшествующие этапы:** 7 (online requests, visits, заглушка `enqueuePush`), 8 (отчёты), 11 (чат) — все используют `enqueuePush` из `src/lib/push/stub.ts`.
**Не входит в этот этап:** in-app inbox (модель `Notification`), PWA-манифест/иконки/offline-shell (этап 14), cron-рассылки (этап 15).

---

## 1. Цели и не-цели

**Цели:**
- Реальный Web Push поверх существующей заглушки — без изменения сигнатуры `enqueuePush(kind, recipients, payload)`, чтобы существующие вызовы в server actions остались как есть.
- Подписка на пуши с любого современного браузера (Chrome/Firefox/Edge/Safari на macOS); iOS PWA — поддержка появится после этапа 14, в этапе 12 баннер на iOS Safari подскажет «Сначала добавьте на главный экран».
- Multi-device на одного пользователя (телефон + ноут) — пуш уходит на все его активные подписки.
- Управление подписками из `/settings`: видеть устройства, отзывать, отправлять тестовый пуш.
- Заглушки-функции для напоминаний о гарантии и регламенте оборудования, которые в этапе 15 будет дёргать cron.

**Не-цели:**
- Внутренний инбокс уведомлений (`Notification` таблица). UI-бейджи «pending заявок» и «непрочитанные сообщения» уже работают и заменяют инбокс для случая «push не дошёл / не подписан».
- Гарантированная доставка push (queue, retry). Если Node-процесс упадёт между записью в БД и отправкой — пуш потеряется, но событие осталось в БД и UI его покажет.
- PWA-инсталляция (этап 14).
- Реальный cron для напоминаний (этап 15) — здесь только функции, которые он будет дёргать.

## 2. Архитектурный обзор

```
[Browser]
  ├─ SubscribeBanner (на /admin /service /client)
  ├─ /settings (toggle "Пуш-уведомления", список устройств, "Тестовый пуш")
  └─ public/sw.js  (push → showNotification; notificationclick → openWindow)
       │
       ▼ при первом разрешении: pushManager.subscribe → POST /api/push/subscribe
[Next.js server]
  ├─ src/lib/push/web-push.ts    (инициализация web-push, pushConfigured)
  ├─ src/lib/push/send.ts        (sendPush(userId, payload) + cleanup 410/404)
  ├─ src/lib/push/enqueue.ts     (замена stub.ts, та же сигнатура enqueuePush)
  ├─ src/lib/push/recipients.ts  (listAdminAndServiceRecipients, getCustomerUserId)
  ├─ src/lib/push/equipment.ts   (sendWarrantyReminder, sendRegulationReminder)
  ├─ /api/push/subscribe         (POST: upsert по endpoint)
  ├─ /api/push/unsubscribe       (POST: удалить по endpoint, только своя)
  ├─ /api/push/test              (POST: sendPush самому себе)
  └─ scripts/generate-vapid.ts   (npm run vapid:generate)
[Postgres]
  └─ PushSubscription (новая таблица)
```

## 3. Модель данных

Миграция `NNNN_push_subscriptions`:

```prisma
model PushSubscription {
  id           String   @id @default(cuid())
  userId       String
  endpoint     String   @unique
  p256dh       String
  auth         String
  userAgent    String?
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

- `endpoint` уникален: тот же браузер при новых ключах перетирает старую запись через upsert.
- `userAgent` сохраняется как есть — UI отображает «MacBook Chrome», «iPhone Safari» (грубый парсинг на клиенте `/settings`).
- `lastUsedAt` обновляется при успешной отправке (полезно для отладки и для возможной будущей чистки давно молчащих устройств — не в этом этапе).
- `onDelete: Cascade` — при удалении пользователя подписки уходят сами.

`Notification` — не создаём.

## 4. ENV и инициализация VAPID

В `.env` добавляются три ключа (уже зарезервированы плейсхолдерами в этапе 1):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@horoshie-basseyny.ru
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...   # дубль публичного ключа для клиента
```

Скрипт `scripts/generate-vapid.ts` (запуск `npm run vapid:generate`) печатает три строки в stdout — копируются вручную в `.env`. Никаких авто-правок файлов.

**Поведение при пустых ключах:**
- `pushConfigured = Boolean(publicKey && privateKey && subject)`.
- `sendPush` при `pushConfigured === false` — `console.warn` и return. Не падает.
- `next build` не падает: ключи читаются в runtime.
- Баннер «Включить уведомления» при пустом `NEXT_PUBLIC_VAPID_PUBLIC_KEY` не показывается (бессмысленно — `pushManager.subscribe` без ключа упадёт).

## 5. Service Worker (`public/sw.js`)

Vanilla JS, без бандлера. Регистрируется со scope `/`. Handlers:
- `install`: `self.skipWaiting()`.
- `activate`: `self.clients.claim()`.
- `push`: парсит JSON из `event.data`, показывает `self.registration.showNotification(title, { body, icon, badge, tag, data: { url } })`. `tag` — для группировки/замены пушей одного и того же события.
- `notificationclick`: закрывает уведомление, ищет открытую вкладку с тем же путём (`includes(pathname)`) → `focus()`, иначе `openWindow(url)`.

Иконки `/icon-192.png` и `/badge-72.png` — временные заглушки в `public/`, реальные приедут с этапа 14. Главное — чтобы не было 404 в SW.

## 6. Клиентский subscribe flow

`src/components/push/SubscribeButton.tsx` (client component, переиспользуется в баннере и `/settings`):

1. Проверяет `'serviceWorker' in navigator && 'PushManager' in window`. Если нет — кнопка отключена.
2. `navigator.serviceWorker.register('/sw.js')`.
3. `Notification.requestPermission()`. Если не `granted` — выходит с toast.
4. `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY) })`.
5. POST `/api/push/subscribe` с `{ subscription: sub.toJSON(), userAgent: navigator.userAgent }`.
6. Toast «Уведомления включены».

`SubscribeBanner.tsx` рендерится в layout `/admin`, `/service`, `/client`. Прячется когда:
- браузер не поддерживает push;
- `Notification.permission === 'granted'` И у юзера есть подписка с текущим endpoint;
- юзер нажал «Не сейчас» (localStorage флаг с TTL 7 дней).

Если `Notification.permission === 'denied'` — баннер показывает текст «Разрешите уведомления в настройках браузера» вместо кнопки (кликом починить нельзя — браузер не даст повторно запросить).

**iOS-нюанс:** На Safari iOS до установки PWA push недоступен. Детект: `/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone`. В этом случае баннер показывает «Сначала добавьте приложение на главный экран» (после этапа 14 — заработает).

## 7. API роуты

### `POST /api/push/subscribe`
- Auth required (401 без сессии).
- Body: `{ subscription: { endpoint, keys: { p256dh, auth } }, userAgent }`.
- Upsert по `endpoint`: создаёт или обновляет `userId`, `p256dh`, `auth`, `userAgent` (на случай, если на устройстве переключили аккаунт).
- ActivityLog: `push.subscription.created` (новый endpoint) или `push.subscription.refreshed` (существовал).
- Ответ: `{ ok: true }`.

### `POST /api/push/unsubscribe`
- Auth required.
- Body: `{ endpoint }`.
- `deleteMany({ where: { endpoint, userId: session.user.id } })` — нельзя отозвать чужую подписку.
- ActivityLog: `push.subscription.removed`.
- Ответ: `{ ok: true }`.

### `POST /api/push/test`
- Auth required.
- Вызывает `sendPush(session.user.id, { title: 'Тест', body: 'Если ты это видишь — пуши работают', url: '/settings' })`.
- ActivityLog: `push.test_sent`.
- Ответ: `{ ok: true, sentTo: number }` где `sentTo` — число активных подписок у юзера (0 → клиент покажет «Нет активных подписок»).

## 8. Серверная отправка (`src/lib/push/send.ts`)

```ts
sendPush(userId: string, payload: { title; body; url; tag? }): Promise<void>
```

- Если `pushConfigured === false` → warn + return.
- Найти все `PushSubscription` юзера, для каждой — `webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 })` параллельно через `Promise.all`.
- `TTL: 86400` (24 часа) — push-сервис подержит пуш сутки, если устройство офлайн.
- На ошибки `statusCode === 404 || 410` собрать endpoint'ы и `deleteMany` после `Promise.all` — это сигнал «подписка устарела/удалена пользователем в браузере». Все остальные ошибки логируются, подписка остаётся.
- На успех обновить `lastUsedAt`.

## 9. Замена `enqueuePush` (`src/lib/push/enqueue.ts`)

Сигнатура **сохраняется один в один** с `stub.ts`:

```ts
enqueuePush(kind: PushKind, recipients: PushRecipient[], payload: Record<string, unknown>): Promise<void>
```

Внутри:
1. **Синхронно** — `prisma.activityLog.createMany` с `action: 'push.queued.<kind>'`. Это видно в `/admin/activity-log`, на этом этапе server action отвечает клиенту.
2. **Fire-and-forget** — `for (recipient of recipients) void sendPush(...).catch(log)`. server action не ждёт push-сервисы.

**Список `PushKind`** (расширяется относительно стаба):
- `new_online_request`
- `request_accepted`
- `request_declined`
- `visit_assigned`
- `visit_report_ready`
- `visit_report_updated`
- `new_chat_message`
- `equipment_warranty_expiring` (новый)
- `equipment_regulation_due` (новый)

**`buildPayload(kind, raw) → { title, body, url, tag }`** — switch-функция, формирует пользовательский payload для браузера. URL для уведомлений по оборудованию различается по роли получателя, поэтому `equipment_*` виды вызывают `enqueuePush` дважды (отдельно клиенту, отдельно сервисникам) с разным `url` в `raw`.

**Поля payload по видам** (для тех, что уже вызывают `enqueuePush` в коде — нужно дописать недостающие поля в server actions):

| kind | существующие поля | нужно добавить |
|---|---|---|
| `new_online_request` | `requestId`, `preview` | — |
| `request_accepted` | `requestId` | `dateLabel` (`'13 мая, 10:00'`) |
| `request_declined` | `requestId`, `reason` | — |
| `visit_assigned` | `visitId` | `summary` (`'13 мая, 10:00 — Иванов, бассейн на даче'`) |
| `visit_report_ready` | `visitId` | `totalLabel`, `summary` |
| `visit_report_updated` | `visitId` | `totalLabel`, `summary` |
| `new_chat_message` | `threadId`, `preview` | `scope` (`'service'`/`'admin'`/`'client'`) |

Файл `src/lib/push/stub.ts` удаляется. Импорты в 5 файлах (`chat.ts`, `online-requests.ts`, `visit-report.ts`, `visit-series.ts`, `visits.ts` в `src/lib/server-actions/`) меняются с `@/lib/push/stub` на `@/lib/push/enqueue`. `listAdminAndServiceRecipients` и `getCustomerUserId` переезжают в `src/lib/push/recipients.ts` и реэкспортируются из `enqueue.ts` для удобства.

## 10. Заглушки для оборудования (`src/lib/push/equipment.ts`)

Готовятся к использованию cron'ом этапа 15 — на этапе 12 покрываются ручным тестом из карточки оборудования.

- `sendWarrantyReminder(equipmentId, daysLeft)` — клиенту (`equipment_warranty_expiring`), URL `/client/pools/<poolId>`.
- `sendRegulationReminder(equipmentId, daysLeft)` — клиенту + всем сервисникам (`equipment_regulation_due`), URL различается по роли.

На странице карточки оборудования (`/admin/.../equipment/[id]` или ближайшая существующая) добавляется кнопка «Отправить тестовое уведомление о регламенте сейчас», вызывающая server action, который дёргает `sendRegulationReminder`. Это нужно только для чекпойнта — позже cron заменит.

## 11. UI: `/settings`

Путь `src/app/settings/page.tsx` — без role-префикса, общая страница. В `Header.tsx` рядом с кнопкой выхода добавляется иконка-шестерёнка со ссылкой на `/settings`.

Блоки:
1. **Уведомления** — статус разрешения, toggle `SubscribeButton`, список устройств (server-rendered: `userAgent`, `createdAt`, `lastUsedAt`, кнопка «Отозвать» → POST `/api/push/unsubscribe`).
2. **Тестовый пуш** — кнопка «Отправить себе тестовый пуш» → POST `/api/push/test`, toast с результатом.

Отдельной `/admin/test-push` не делаем — кнопка живёт в `/settings`.

## 12. ActivityLog — список новых событий

- `push.subscription.created`
- `push.subscription.refreshed`
- `push.subscription.removed`
- `push.test_sent`
- `push.queued.<kind>` (уже было в стабе, остаётся)

`push.sent.<kind>` **не** пишем — `queued` уже отражает намерение, успех/неуспех отправки виден в stdout (мёртвые подписки логируются при удалении).

## 13. Зависимости

Добавить в `package.json`:
- `web-push` (^3.x) — отправка VAPID-подписанных пушей.
- `@types/web-push` (devDependencies).

Удалить не нужно — стаба не использовала внешних пакетов.

## 14. Чекпойнт этапа 12

> 1. `npm run vapid:generate` → вписать ключи в `.env` → перезапустить dev.
> 2. Открыть `http://localhost:3000` в Chrome → залогиниться → увидеть баннер «Включить уведомления» на роле-главной → нажать «Разрешить» → разрешить в браузере → баннер пропал.
> 3. Открыть `/settings` → в списке устройств — текущий браузер → нажать «Отправить себе тестовый пуш» → системное уведомление пришло.
> 4. В другой вкладке/окне залогиниться клиентом → создать онлайн-заявку → в окне сервисника — пуш «Новая заявка», клик → попадаем на `/service/online-requests/...`.
> 5. Открыть карточку оборудования → «Отправить тестовое уведомление о регламенте» → клиенту приходит пуш «Регламент через 7 дней» с переходом на `/client/pools/...`.
> 6. В `/settings` → «Отозвать» устройство → отправить тестовый пуш → toast «Нет активных подписок».
> 7. iOS-проверка отложена до этапа 14 (PWA-манифест).

## 15. Открытые вопросы для будущих этапов

- **Push outbox + worker** (надёжная доставка) — рассмотреть на этапе 15 одновременно с cron-задачами, если fire-and-forget даст заметные потери в проде.
- **Тихие часы / preferences по типам уведомлений** — не в скоупе сейчас, добавлять после фидбэка клиента из реальной работы.
- **Иконки и манифест** — этап 14.
- **Чистка давно молчащих подписок** (`lastUsedAt` > N месяцев) — возможный cron позже, не в этапе 12.
