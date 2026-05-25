# Этап 12. Web Push — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить заглушку `enqueuePush` на реальную доставку Web Push (VAPID, Service Worker, multi-device), не меняя сигнатуру вызова — чтобы существующие 5 файлов server actions остались работоспособны.

**Architecture:** Браузер регистрирует `public/sw.js`, подписывается через `PushManager`, эндпоинт сохраняется в `PushSubscription`. Server при вызове `enqueuePush` пишет ActivityLog синхронно, потом fire-and-forget `sendPush` на каждого получателя через библиотеку `web-push`. UI для управления подписками — `/settings` + баннер на роле-главных.

**Tech Stack:** Next.js 16 App Router, Prisma 7, `web-push@3.x`, vanilla JS Service Worker.

**Spec:** [`docs/superpowers/specs/2026-05-25-stage-12-web-push-design.md`](../specs/2026-05-25-stage-12-web-push-design.md)

**Конвенция верификации:** Этот проект **не использует unit-test раннер.** Каждая задача завершается комбинацией `npx tsc --noEmit` / `npm run build` / `curl localhost:3000/...` / визуальной проверки. Финальный чекпойнт всего этапа (после Задачи 12) — ручной прогон 7 сценариев из spec.

---

## File Structure

**Новые файлы:**
- `scripts/generate-vapid.ts` — печатает 3 ENV-строки для копипасты в `.env`.
- `scripts/generate-placeholder-icons.ts` — кладёт `public/icon-192.png` и `public/badge-72.png` (тёмно-бирюзовые квадраты до этапа 14).
- `public/sw.js` — Service Worker (push, notificationclick).
- `public/icon-192.png`, `public/badge-72.png` — заглушки иконок.
- `prisma/migrations/<ts>_push_subscriptions/migration.sql` — модель `PushSubscription`.
- `src/lib/push/web-push.ts` — однократная инициализация библиотеки + флаг `pushConfigured`.
- `src/lib/push/send.ts` — `sendPush(userId, payload)` с очисткой мёртвых подписок.
- `src/lib/push/recipients.ts` — `listAdminAndServiceRecipients`, `getCustomerUserId` (переезд из `stub.ts`).
- `src/lib/push/enqueue.ts` — `enqueuePush` + `buildPayload` + `PushKind`. **Заменяет `stub.ts`.**
- `src/lib/push/equipment.ts` — `sendWarrantyReminder`, `sendRegulationReminder` (готовы для cron'а этапа 15).
- `src/lib/push/client-utils.ts` — `urlBase64ToUint8Array` (используется на клиенте).
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/push/unsubscribe/route.ts`
- `src/app/api/push/test/route.ts`
- `src/components/push/SubscribeButton.tsx` — client component.
- `src/components/push/SubscribeBanner.tsx` — баннер на роле-главных.
- `src/components/push/DevicesList.tsx` — список устройств (server) + кнопка «Отозвать» (server action).
- `src/components/push/TestPushButton.tsx` — кнопка «Отправить себе тестовый пуш».
- `src/components/equipment/SendRegulationTestButton.tsx` — кнопка в карточке оборудования.
- `src/app/settings/page.tsx` — общая страница настроек.
- `src/lib/server-actions/push.ts` — server actions: `unsubscribeDeviceAction`, `sendTestPushAction`, `sendRegulationReminderTestAction`.

**Изменяемые файлы:**
- `prisma/schema.prisma` — модель `PushSubscription` + relation в `User`.
- `package.json` — деп `web-push`, `@types/web-push`, скрипты `vapid:generate`, `icons:placeholders`.
- `.env` (вручную) — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `src/components/Header.tsx` — иконка-шестерёнка со ссылкой `/settings`.
- `src/app/admin/page.tsx`, `src/app/service/page.tsx`, `src/app/client/page.tsx` — рендер `<SubscribeBanner />` сверху.
- `src/lib/server-actions/chat.ts` — импорт `@/lib/push/enqueue` + `scope` в payload.
- `src/lib/server-actions/online-requests.ts` — импорт + `dateLabel` в `request_accepted`.
- `src/lib/server-actions/visit-report.ts` — импорт + `totalLabel`, `summary` в `visit_report_*`.
- `src/lib/server-actions/visit-series.ts` — импорт + `summary` в `visit_assigned`.
- `src/lib/server-actions/visits.ts` — импорт + `summary` в `visit_assigned`.
- Карточка оборудования (внутри `/[scope]/customers/[customerId]/pools/[poolId]` — `EquipmentSection` или эквивалент) — кнопка «Отправить тестовое уведомление о регламенте».

**Удаляемые файлы:**
- `src/lib/push/stub.ts`.

---

## Task 1: Зависимости + VAPID-скрипт

**Files:**
- Modify: `package.json`
- Create: `scripts/generate-vapid.ts`

- [ ] **Step 1: Установить зависимость**

```bash
npm install web-push@^3.6.7
npm install --save-dev @types/web-push@^3.6.4
```

- [ ] **Step 2: Создать скрипт `scripts/generate-vapid.ts`**

```ts
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Скопируй в .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@horoshie-basseyny.ru`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
```

- [ ] **Step 3: Добавить npm-скрипт**

В `package.json` в `scripts`:
```json
"vapid:generate": "tsx scripts/generate-vapid.ts"
```

- [ ] **Step 4: Запустить и убедиться, что печатает 4 строки**

```bash
npm run vapid:generate
```

Ожидаемый вывод: 4 строки `VAPID_*=...` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY=...`. Сохрани эти значения временно — нужно вписать в `.env` в Task 12.

- [ ] **Step 5: Коммит**

```bash
git add package.json package-lock.json scripts/generate-vapid.ts
git commit -m "этап 12: web-push dep + скрипт vapid:generate"
```

---

## Task 2: Prisma-модель `PushSubscription`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_push_subscriptions/migration.sql` (генерируется prisma migrate)

- [ ] **Step 1: Добавить модель в `schema.prisma`**

В конец файла:
```prisma
model PushSubscription {
  id         String   @id @default(cuid())
  userId     String
  endpoint   String   @unique
  p256dh     String
  auth       String
  userAgent  String?
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 2: Добавить обратную relation в модель `User`**

Найди модель `User`, добавь поле:
```prisma
pushSubscriptions PushSubscription[]
```

- [ ] **Step 3: Сгенерировать миграцию**

```bash
npx prisma migrate dev --name push_subscriptions
```

Ожидается: новая папка `prisma/migrations/<timestamp>_push_subscriptions/` с `migration.sql`, без ошибок.

- [ ] **Step 4: Проверить type-check**

```bash
npx tsc --noEmit
```

Ожидается: 0 ошибок. (Prisma client пересгенерировался автоматически в Step 3.)

- [ ] **Step 5: Коммит**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "этап 12: модель PushSubscription"
```

---

## Task 3: Service Worker + иконки-заглушки

**Files:**
- Create: `public/sw.js`
- Create: `scripts/generate-placeholder-icons.ts`
- Create: `public/icon-192.png`, `public/badge-72.png`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Создать `public/sw.js`**

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const options = {
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = new URL(url, self.location.origin);
    const existing = all.find((c) => new URL(c.url).pathname === target.pathname);
    if (existing) { await existing.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
```

- [ ] **Step 2: Создать `scripts/generate-placeholder-icons.ts`**

```ts
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const teal = { r: 13, g: 148, b: 136, alpha: 1 };

async function make(path: string, size: number) {
  await mkdir(dirname(path), { recursive: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: teal } })
    .png()
    .toFile(path);
  console.log(`wrote ${path}`);
}

await make("public/icon-192.png", 192);
await make("public/badge-72.png", 72);
```

- [ ] **Step 3: Добавить npm-скрипт**

В `package.json` `scripts`:
```json
"icons:placeholders": "tsx scripts/generate-placeholder-icons.ts"
```

- [ ] **Step 4: Сгенерировать иконки**

```bash
npm run icons:placeholders
```

Ожидается: два сообщения `wrote public/...`. Файлы появились в `public/`.

- [ ] **Step 5: Поднять dev и проверить, что SW и иконки отдаются**

В одном терминале:
```bash
npm run dev
```

В другом:
```bash
curl -I http://localhost:3000/sw.js
curl -I http://localhost:3000/icon-192.png
curl -I http://localhost:3000/badge-72.png
```

Ожидается: `HTTP/1.1 200 OK` для всех трёх. Останови `npm run dev` (Ctrl+C) после проверки.

- [ ] **Step 6: Коммит**

```bash
git add public/sw.js public/icon-192.png public/badge-72.png scripts/generate-placeholder-icons.ts package.json
git commit -m "этап 12: service worker + placeholder иконки"
```

---

## Task 4: web-push init + sendPush

**Files:**
- Create: `src/lib/push/web-push.ts`
- Create: `src/lib/push/send.ts`

- [ ] **Step 1: Создать `src/lib/push/web-push.ts`**

```ts
import webpush from "web-push";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

export const pushConfigured = Boolean(publicKey && privateKey && subject);

if (pushConfigured) {
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}

export { webpush };
```

- [ ] **Step 2: Создать `src/lib/push/send.ts`**

```ts
import { prisma } from "@/lib/prisma";
import { webpush, pushConfigured } from "./web-push";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured) {
    console.warn("[push] VAPID не настроен, sendPush no-op", { userId, payload });
    return 0;
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const json = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 60 * 60 * 24 },
        );
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastUsedAt: new Date() },
        });
        delivered += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          console.error("[push] sendNotification failed", { endpoint: s.endpoint, status, err });
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } });
    console.log("[push] удалено мёртвых подписок:", deadEndpoints.length);
  }

  return delivered;
}
```

`sendPush` возвращает число успешно доставленных подписок (нужно для `/api/push/test`, чтобы клиент мог показать «отправлено на N устройств» / «нет подписок»).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Ожидается: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/push/web-push.ts src/lib/push/send.ts
git commit -m "этап 12: web-push init + sendPush с очисткой 410/404"
```

---

## Task 5: Хелперы получателей + замена stub.ts на enqueue.ts

**Files:**
- Create: `src/lib/push/recipients.ts`
- Create: `src/lib/push/enqueue.ts`
- Delete: `src/lib/push/stub.ts`

- [ ] **Step 1: Создать `src/lib/push/recipients.ts`** (переезд хелперов из стаба, тело без изменений)

```ts
import { prisma } from "@/lib/prisma";

export type PushRecipient = { userId: string };

/** Все активные admin+service. */
export async function listAdminAndServiceRecipients(): Promise<PushRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    select: { id: true },
  });
  return users.map((u) => ({ userId: u.id }));
}

/** userId владельца Customer (для push клиенту). */
export async function getCustomerUserId(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  return c?.userId ?? null;
}
```

- [ ] **Step 2: Создать `src/lib/push/enqueue.ts`**

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPush, type PushPayload } from "./send";
import type { PushRecipient } from "./recipients";

export { listAdminAndServiceRecipients, getCustomerUserId } from "./recipients";
export type { PushRecipient };

export type PushKind =
  | "new_online_request"
  | "request_accepted"
  | "request_declined"
  | "visit_assigned"
  | "visit_report_ready"
  | "visit_report_updated"
  | "new_chat_message"
  | "equipment_warranty_expiring"
  | "equipment_regulation_due";

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function buildPayload(kind: PushKind, raw: Record<string, unknown>): PushPayload {
  switch (kind) {
    case "new_online_request":
      return {
        title: "Новая заявка",
        body: s(raw.preview, "Клиент записался на сервис"),
        url: `/service/online-requests/${s(raw.requestId)}`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "request_accepted":
      return {
        title: "Заявка принята",
        body: `Визит ${s(raw.dateLabel, "назначен")}`,
        url: `/client/requests`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "request_declined":
      return {
        title: "Заявка отклонена",
        body: s(raw.reason, "Сервисник отклонил заявку"),
        url: `/client/requests`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "visit_assigned":
      return {
        title: "Назначен визит",
        body: s(raw.summary, "Новый визит в календаре"),
        url: `/service/visits/${s(raw.visitId)}`,
        tag: `visit-${s(raw.visitId)}`,
      };
    case "visit_report_ready":
      return {
        title: "Отчёт готов",
        body: `Сумма к оплате: ${s(raw.totalLabel, "—")}`,
        url: `/client/visits/${s(raw.visitId)}`,
        tag: `report-${s(raw.visitId)}`,
      };
    case "visit_report_updated":
      return {
        title: "Отчёт обновлён",
        body: s(raw.summary, "Сервисник обновил отчёт"),
        url: `/client/visits/${s(raw.visitId)}`,
        tag: `report-${s(raw.visitId)}`,
      };
    case "new_chat_message":
      return {
        title: "Новое сообщение",
        body: s(raw.preview, "Сообщение в поддержке"),
        url: `/${s(raw.scope, "client")}/support/${s(raw.threadId)}`,
        tag: `chat-${s(raw.threadId)}`,
      };
    case "equipment_warranty_expiring":
      return {
        title: "Заканчивается гарантия",
        body: `${s(raw.title, "Оборудование")} — ${s(raw.daysLeft, "14")} дн.`,
        url: s(raw.url, "/"),
        tag: `warranty-${s(raw.equipmentId)}`,
      };
    case "equipment_regulation_due":
      return {
        title: "Скоро регламент",
        body: `${s(raw.title, "Оборудование")} — через ${s(raw.daysLeft, "7")} дн.`,
        url: s(raw.url, "/"),
        tag: `regulation-${s(raw.equipmentId)}`,
      };
  }
}

export async function enqueuePush(
  kind: PushKind,
  recipients: PushRecipient[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipients.length === 0) return;

  // 1. Синхронно — ActivityLog. server action ответит клиенту сразу после этого.
  await prisma.activityLog.createMany({
    data: recipients.map((r) => ({
      actorId: null,
      action: `push.queued.${kind}`,
      entityType: "User",
      entityId: r.userId,
      diff: payload as Prisma.InputJsonValue,
    })),
  });

  // 2. Fire-and-forget — реальная отправка. .catch чтобы unhandled rejection не валил Node.
  const browserPayload = buildPayload(kind, payload);
  for (const r of recipients) {
    void sendPush(r.userId, browserPayload).catch((err) => {
      console.error("[push] sendPush failed", { userId: r.userId, kind, err });
    });
  }
}
```

- [ ] **Step 3: Удалить `src/lib/push/stub.ts`**

```bash
rm src/lib/push/stub.ts
```

- [ ] **Step 4: Type-check (ожидаются ошибки в 5 файлах с импортом стаба)**

```bash
npx tsc --noEmit
```

Ожидается: ошибки `Cannot find module '@/lib/push/stub'` в 5 файлах. Это нормально — починим в Task 6.

- [ ] **Step 5: Коммит (с заведомо ломаным состоянием — починим в следующей задаче)**

Не коммить сейчас. Переходи к Task 6, потом единый коммит.

---

## Task 6: Перевести 5 server actions на новый enqueue + дополнить payload

**Files:**
- Modify: `src/lib/server-actions/chat.ts`
- Modify: `src/lib/server-actions/online-requests.ts`
- Modify: `src/lib/server-actions/visit-report.ts`
- Modify: `src/lib/server-actions/visit-series.ts`
- Modify: `src/lib/server-actions/visits.ts`

- [ ] **Step 1: `chat.ts` — заменить импорт + добавить `scope` в payload**

Заменить `from "@/lib/push/stub"` на `from "@/lib/push/enqueue"`.

Найди вызовы `enqueuePush("new_chat_message", ...)`. В каждый payload добавь `scope`:
- Если получатели — сервисники/админ (вызов из ветки, где `sender.role === "client"`): `scope: "service"`.
- Если получатель — клиент (вызов из ветки иначе): `scope: "client"`.

Пример:
```ts
await enqueuePush("new_chat_message", recipients, { threadId, preview, scope: "service" });
// ...
await enqueuePush("new_chat_message", [{ userId: clientUserId }], { threadId, preview, scope: "client" });
```

- [ ] **Step 2: `online-requests.ts` — заменить импорт + `dateLabel`**

Заменить импорт. Найди вызов `enqueuePush("request_accepted", ...)`. Перед вызовом сформируй `dateLabel`:
```ts
const dateLabel = new Date(visit.scheduledAt).toLocaleString("ru-RU", {
  day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
});
await enqueuePush("request_accepted", [{ userId: clientUserId }], {
  requestId: req.id,
  dateLabel,
});
```

(Имя поля — `scheduledAt` или как принято в `Visit`. Свериться по `prisma/schema.prisma`.)

- [ ] **Step 3: `visits.ts` и `visit-series.ts` — заменить импорт + `summary` в `visit_assigned`**

Перед каждым вызовом `enqueuePush("visit_assigned", ...)` сформировать `summary`:
```ts
const summary = `${new Date(visit.scheduledAt).toLocaleString("ru-RU", {
  day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
})} — ${customer.name}, ${pool.name}`;
await enqueuePush("visit_assigned", [{ userId: serviceUserId }], {
  visitId: visit.id,
  summary,
});
```

(Если данные `customer`/`pool` ещё не загружены в этом месте — сделать `include` в исходном `prisma.visit.create/findUnique`.)

- [ ] **Step 4: `visit-report.ts` — заменить импорт + `totalLabel`, `summary`**

Перед вызовом `enqueuePush("visit_report_ready" | "visit_report_updated", ...)`:
```ts
const totalLabel = `${total} ₽`;
const summary = `${new Date(visit.scheduledAt).toLocaleDateString("ru-RU")} — ${pool.name}`;
await enqueuePush(wasCompletedBefore ? "visit_report_updated" : "visit_report_ready", [{ userId }], {
  visitId: visit.id,
  totalLabel,
  summary,
});
```

`total` — сумма из существующей логики этапа 8. `pool.name` — из `visit.pool`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Ожидается: 0 ошибок.

- [ ] **Step 6: Build**

```bash
npm run build
```

Ожидается: успешная сборка. Может быть pre-existing ESLint warning в `AddressAutocomplete.tsx` — игнорировать.

- [ ] **Step 7: Коммит вместе с Task 5**

```bash
git add src/lib/push/ src/lib/server-actions/
git commit -m "этап 12: enqueuePush на реальный sendPush + payload-поля"
```

---

## Task 7: API роуты subscribe / unsubscribe / test

**Files:**
- Create: `src/app/api/push/subscribe/route.ts`
- Create: `src/app/api/push/unsubscribe/route.ts`
- Create: `src/app/api/push/test/route.ts`

- [ ] **Step 1: `src/app/api/push/subscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
  userAgent: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { subscription, userAgent } = parsed.data;
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: subscription.endpoint },
  });

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId: session.user.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      action: existing ? "push.subscription.refreshed" : "push.subscription.created",
      entityType: "PushSubscription",
      entityId: subscription.endpoint.slice(0, 100),
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `src/app/api/push/unsubscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ endpoint: z.string().url() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.user.id },
  });

  if (result.count > 0) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        action: "push.subscription.removed",
        entityType: "PushSubscription",
        entityId: parsed.data.endpoint.slice(0, 100),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: `src/app/api/push/test/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push/send";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sentTo = await sendPush(session.user.id, {
    title: "Тестовый пуш",
    body: "Если ты это видишь — пуши работают",
    url: "/settings",
    tag: "test",
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      action: "push.test_sent",
      entityType: "User",
      entityId: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, sentTo });
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Ожидается: 0 ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/app/api/push/
git commit -m "этап 12: API роуты subscribe/unsubscribe/test"
```

---

## Task 8: Клиентский SubscribeButton + helper

**Files:**
- Create: `src/lib/push/client-utils.ts`
- Create: `src/components/push/SubscribeButton.tsx`

- [ ] **Step 1: Создать `src/lib/push/client-utils.ts`**

```ts
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosWithoutPwa(): boolean {
  if (typeof navigator === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  // navigator.standalone — нестандартный, есть только в Safari iOS
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return isIos && standalone !== true;
}
```

- [ ] **Step 2: Создать `src/components/push/SubscribeButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push/client-utils";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Props = {
  /** После успеха — обновить родительский UI (например, перезагрузить страницу настроек). */
  onSubscribed?: () => void;
  className?: string;
  label?: string;
};

export function SubscribeButton({ onSubscribed, className, label = "Разрешить уведомления" }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    if (!isPushSupported()) { setError("Браузер не поддерживает уведомления"); return; }
    if (!PUBLIC_KEY) { setError("VAPID-ключ не настроен"); return; }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied" ? "Разрешение заблокировано в браузере" : "Разрешение не выдано");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) { setError(`Сервер вернул ${res.status}`); return; }
      onSubscribed?.();
    } catch (e) {
      console.error("[push] subscribe failed", e);
      setError("Не удалось подписаться");
    }
  }

  return (
    <div className={className}>
      <Button onClick={() => startTransition(handle)} disabled={pending}>
        {pending ? "Подключаем…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Ожидается: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/push/client-utils.ts src/components/push/SubscribeButton.tsx
git commit -m "этап 12: SubscribeButton + client utils"
```

---

## Task 9: SubscribeBanner + интеграция в роле-главные

**Files:**
- Create: `src/components/push/SubscribeBanner.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/service/page.tsx`
- Modify: `src/app/client/page.tsx`

- [ ] **Step 1: Создать `src/components/push/SubscribeBanner.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { SubscribeButton } from "./SubscribeButton";
import { isPushSupported, isIosWithoutPwa } from "@/lib/push/client-utils";

const DISMISS_KEY = "push.banner.dismissedUntil";
const DISMISS_DAYS = 7;

type State =
  | "loading"
  | "hidden"
  | "ask"
  | "denied"
  | "ios-needs-pwa";

export function SubscribeBanner() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) { setState("hidden"); return; }
      if (isIosWithoutPwa()) { setState("ios-needs-pwa"); return; }

      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (Date.now() < dismissedUntil) { setState("hidden"); return; }

      if (Notification.permission === "denied") { setState("denied"); return; }

      if (Notification.permission === "granted") {
        // Есть ли активная подписка с этим endpoint?
        try {
          const reg = await navigator.serviceWorker.getRegistration("/sw.js");
          const sub = await reg?.pushManager.getSubscription();
          if (sub) { setState("hidden"); return; }
        } catch { /* fallthrough */ }
      }

      setState("ask");
    })();
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setState("hidden");
  }

  if (state === "loading" || state === "hidden") return null;

  const wrap = "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm";

  if (state === "denied") {
    return (
      <div className={wrap}>
        <strong className="block">Уведомления заблокированы в браузере.</strong>
        <span className="text-zinc-700">
          Открой настройки сайта в браузере (значок замка слева от адресной строки) → «Уведомления» → «Разрешить».
        </span>
      </div>
    );
  }

  if (state === "ios-needs-pwa") {
    return (
      <div className={wrap}>
        <strong className="block">Уведомления на iPhone требуют установки приложения.</strong>
        <span className="text-zinc-700">
          В Safari нажми «Поделиться» → «На экран Домой», затем открой добавленную иконку и разреши уведомления.
        </span>
      </div>
    );
  }

  return (
    <div className={`${wrap} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <strong className="block">Включить уведомления?</strong>
        <span className="text-zinc-700">Будем присылать новые заявки, отчёты и сообщения из чата.</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={dismiss} className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-amber-100">
          Не сейчас
        </button>
        <SubscribeButton onSubscribed={() => setState("hidden")} label="Разрешить" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Вставить баннер в `src/app/admin/page.tsx`**

Сразу после `<PageHeader ... />` (или эквивалентного шапочного блока на странице) и до сетки `SECTIONS`:
```tsx
import { SubscribeBanner } from "@/components/push/SubscribeBanner";
// ...
<SubscribeBanner />
```

- [ ] **Step 3: То же в `src/app/service/page.tsx`**

Импорт + `<SubscribeBanner />` в верх контента.

- [ ] **Step 4: То же в `src/app/client/page.tsx`**

Импорт + `<SubscribeBanner />` в верх контента.

- [ ] **Step 5: Type-check + build**

```bash
npx tsc --noEmit && npm run build
```

Ожидается: 0 ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/components/push/SubscribeBanner.tsx src/app/admin/page.tsx src/app/service/page.tsx src/app/client/page.tsx
git commit -m "этап 12: SubscribeBanner на роле-главных"
```

---

## Task 10: Страница `/settings` + шестерёнка в Header + server actions

**Files:**
- Create: `src/lib/server-actions/push.ts`
- Create: `src/components/push/DevicesList.tsx`
- Create: `src/components/push/TestPushButton.tsx`
- Create: `src/app/settings/page.tsx`
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Создать `src/lib/server-actions/push.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push/send";

export async function unsubscribeDeviceAction(endpoint: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });
  if (result.count > 0) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        action: "push.subscription.removed",
        entityType: "PushSubscription",
        entityId: endpoint.slice(0, 100),
      },
    });
  }
  revalidatePath("/settings");
}

export async function sendTestPushAction(): Promise<{ sentTo: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

  const sentTo = await sendPush(session.user.id, {
    title: "Тестовый пуш",
    body: "Если ты это видишь — пуши работают",
    url: "/settings",
    tag: "test",
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      action: "push.test_sent",
      entityType: "User",
      entityId: session.user.id,
    },
  });
  return { sentTo };
}
```

- [ ] **Step 2: Создать `src/components/push/DevicesList.tsx`** (server component с client-form внутри)

```tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unsubscribeDeviceAction } from "@/lib/server-actions/push";
import { Button } from "@/components/ui/button";

function deviceLabel(ua: string | null): string {
  if (!ua) return "Устройство без имени";
  if (/iPhone/.test(ua)) return "iPhone Safari";
  if (/iPad/.test(ua)) return "iPad Safari";
  if (/Android/.test(ua)) return /Chrome/.test(ua) ? "Android Chrome" : "Android browser";
  if (/Macintosh/.test(ua)) return /Chrome/.test(ua) ? "Mac Chrome" : /Firefox/.test(ua) ? "Mac Firefox" : "Mac Safari";
  if (/Windows/.test(ua)) return /Chrome/.test(ua) ? "Windows Chrome" : /Edg\//.test(ua) ? "Windows Edge" : /Firefox/.test(ua) ? "Windows Firefox" : "Windows";
  return ua.slice(0, 60);
}

export async function DevicesList() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { lastUsedAt: "desc" },
  });

  if (subs.length === 0) {
    return <p className="text-sm text-zinc-500">Нет подписанных устройств. Включи уведомления выше или в баннере на главной.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200">
      {subs.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <div className="font-medium text-zinc-900">{deviceLabel(s.userAgent)}</div>
            <div className="text-xs text-zinc-500">
              Подписано {s.createdAt.toLocaleDateString("ru-RU")} · Последняя доставка {s.lastUsedAt.toLocaleDateString("ru-RU")}
            </div>
          </div>
          <form action={unsubscribeDeviceAction.bind(null, s.endpoint)}>
            <Button type="submit" variant="outline" size="sm">Отозвать</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Создать `src/components/push/TestPushButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendTestPushAction } from "@/lib/server-actions/push";

export function TestPushButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setMsg(null);
    try {
      const { sentTo } = await sendTestPushAction();
      setMsg(sentTo === 0 ? "Нет активных подписок (включи уведомления выше)" : `Пуш отправлен на ${sentTo} устройств(а)`);
    } catch {
      setMsg("Ошибка — проверь логи сервера (возможно, VAPID не настроен)");
    }
  }

  return (
    <div>
      <Button onClick={() => startTransition(handle)} disabled={pending}>
        {pending ? "Отправляем…" : "Отправить себе тестовый пуш"}
      </Button>
      {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/app/settings/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { SubscribeButton } from "@/components/push/SubscribeButton";
import { DevicesList } from "@/components/push/DevicesList";
import { TestPushButton } from "@/components/push/TestPushButton";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader title="Настройки" />
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-zinc-900">Пуш-уведомления</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Подпиши текущий браузер — будем присылать новые заявки, отчёты и сообщения из чата.
            </p>
            <div className="mt-4">
              <SubscribeButton label="Подписать этот браузер" />
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-700">Подписанные устройства</h3>
              <div className="mt-2">
                <DevicesList />
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-zinc-900">Тестовый пуш</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Отправляет себе уведомление, чтобы проверить, что всё работает.
            </p>
            <div className="mt-4">
              <TestPushButton />
            </div>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
```

(Если `Card` или `PageContainer` имеют другие пропсы — свериться по уже существующим страницам, например `src/app/admin/page.tsx`.)

- [ ] **Step 5: Добавить шестерёнку в `src/components/Header.tsx`**

В блоке `session?.user ?` (где сейчас имя и кнопка «Выйти») перед формой с кнопкой добавить:
```tsx
<Link
  href="/settings"
  aria-label="Настройки"
  className="rounded-lg p-2 text-zinc-700 transition hover:bg-zinc-100"
>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
</Link>
```

- [ ] **Step 6: Type-check + build**

```bash
npx tsc --noEmit && npm run build
```

Ожидается: 0 ошибок.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/server-actions/push.ts src/components/push/DevicesList.tsx src/components/push/TestPushButton.tsx src/app/settings/page.tsx src/components/Header.tsx
git commit -m "этап 12: /settings + шестерёнка в шапке"
```

---

## Task 11: Заглушки оборудования + тестовая кнопка

**Files:**
- Create: `src/lib/push/equipment.ts`
- Modify: `src/lib/server-actions/push.ts` (добавить `sendRegulationReminderTestAction`)
- Create: `src/components/equipment/SendRegulationTestButton.tsx`
- Modify: страница карточки оборудования (внутри `pools/[poolId]/page.tsx` или общий `EquipmentSection` — определить по grep)

- [ ] **Step 1: Создать `src/lib/push/equipment.ts`**

```ts
import { prisma } from "@/lib/prisma";
import { enqueuePush } from "./enqueue";
import { getCustomerUserId, listAdminAndServiceRecipients } from "./recipients";

async function loadEquipment(equipmentId: string) {
  return prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      pool: { select: { id: true, customerId: true, name: true } },
      template: { select: { name: true } },
    },
  });
}

export async function sendWarrantyReminder(equipmentId: string, daysLeft = 14): Promise<void> {
  const eq = await loadEquipment(equipmentId);
  if (!eq) return;
  const userId = await getCustomerUserId(eq.pool.customerId);
  if (!userId) return;

  await enqueuePush("equipment_warranty_expiring", [{ userId }], {
    equipmentId,
    poolId: eq.pool.id,
    title: eq.template.name,
    daysLeft,
    url: `/client/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
  });
}

export async function sendRegulationReminder(equipmentId: string, daysLeft = 7): Promise<void> {
  const eq = await loadEquipment(equipmentId);
  if (!eq) return;

  // Клиенту
  const clientUserId = await getCustomerUserId(eq.pool.customerId);
  if (clientUserId) {
    await enqueuePush("equipment_regulation_due", [{ userId: clientUserId }], {
      equipmentId,
      poolId: eq.pool.id,
      title: eq.template.name,
      daysLeft,
      url: `/client/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
    });
  }

  // Сервисникам + админам
  const staff = await listAdminAndServiceRecipients();
  if (staff.length > 0) {
    await enqueuePush("equipment_regulation_due", staff, {
      equipmentId,
      poolId: eq.pool.id,
      title: eq.template.name,
      daysLeft,
      url: `/service/customers/${eq.pool.customerId}/pools/${eq.pool.id}`,
    });
  }
}
```

(Если у клиента нет роутинга `/client/customers/...` — оставить URL как есть; всё равно ведёт на роле-главную через ролевой proxy. Это **не** блокер для этапа 12.)

- [ ] **Step 2: Добавить server action в `src/lib/server-actions/push.ts`**

В конец файла:
```ts
import { sendRegulationReminder } from "@/lib/push/equipment";

export async function sendRegulationReminderTestAction(equipmentId: string): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") throw new Error("forbidden");
  await sendRegulationReminder(equipmentId, 7);
}
```

- [ ] **Step 3: Создать `src/components/equipment/SendRegulationTestButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendRegulationReminderTestAction } from "@/lib/server-actions/push";

export function SendRegulationTestButton({ equipmentId }: { equipmentId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setMsg(null);
    try {
      await sendRegulationReminderTestAction(equipmentId);
      setMsg("Пуш отправлен клиенту и сервисникам (проверь ActivityLog)");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div>
      <Button onClick={() => startTransition(handle)} disabled={pending} variant="outline" size="sm">
        {pending ? "Отправляем…" : "Тест: пуш о регламенте"}
      </Button>
      {msg && <p className="mt-1 text-xs text-zinc-600">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Добавить кнопку в `src/components/pools/PoolEquipment.tsx`**

Этот компонент уже рендерит каждую единицу оборудования и содержит кнопку «Заменено сегодня» (этап 5). Рядом с ней добавь `<SendRegulationTestButton equipmentId={eq.id} />` — **только для admin**.

Если компонент уже принимает роль/scope через props — используй это. Если нет — добавь новый prop `role: string` от родителя (страница `src/app/admin/customers/[id]/pools/[poolId]/page.tsx` знает scope из своего пути) и рендери кнопку условием `{role === "admin" && <SendRegulationTestButton ... />}`. На странице сервисника кнопка не нужна.

- [ ] **Step 5: Type-check + build**

```bash
npx tsc --noEmit && npm run build
```

Ожидается: 0 ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/push/equipment.ts src/lib/server-actions/push.ts src/components/equipment/ src/app/admin/ src/components/
git commit -m "этап 12: equipment push-стабы + тестовая кнопка в карточке"
```

---

## Task 12: VAPID-ключи в `.env` + ручной чекпойнт

**Files:**
- Modify (вручную, не коммитить): `.env`

- [ ] **Step 1: Сгенерировать ключи**

```bash
npm run vapid:generate
```

- [ ] **Step 2: Вписать 4 строки в `.env`**

Открой `.env`, вставь (или замени плейсхолдеры):
```
VAPID_PUBLIC_KEY=<значение из stdout>
VAPID_PRIVATE_KEY=<значение из stdout>
VAPID_SUBJECT=mailto:admin@horoshie-basseyny.ru
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<то же, что VAPID_PUBLIC_KEY>
```

`.env` уже должен быть в `.gitignore` — **не коммитить**.

- [ ] **Step 3: Перезапустить dev**

```bash
npm run dev
```

- [ ] **Step 4: Чекпойнт — 7 сценариев**

Прогон вручную в браузере (Chrome рекомендуется для первого прогона, потом можно повторить в Firefox/Edge):

1. **Подписка через баннер.** Открой http://localhost:3000 в Chrome → залогинься админом → на `/admin` сверху виден баннер «Включить уведомления» → нажми «Разрешить» → подтверди в браузере → баннер пропал.
2. **Тестовый пуш из настроек.** Открой `/settings` (шестерёнка в шапке) → в списке устройств — «Windows Chrome» (или твоё) → нажми «Отправить себе тестовый пуш» → системное уведомление «Тестовый пуш» приходит → клик по нему → открывается `/settings`.
3. **Реальное событие.** В другом окне (или режиме инкогнито) залогинься клиентом → создай онлайн-заявку (`/client/request-visit`) → в окне админа приходит пуш «Новая заявка» → клик → попадаешь на `/service/online-requests/...`.
4. **Принятие заявки.** Прими эту заявку в окне админа → клиент получает пуш «Заявка принята».
5. **Пуш о регламенте.** В окне админа открой карточку любого бассейна → раздел «Оборудование» → у единицы оборудования нажми «Тест: пуш о регламенте» → клиент получает пуш «Скоро регламент», админ тоже (если подписан с того же устройства — может прийти оба, или один — зависит от dedupe по tag).
6. **Отзыв подписки.** В `/settings` → «Отозвать» твоё устройство → запись пропала из списка → нажми «Отправить себе тестовый пуш» → toast «Нет активных подписок».
7. **iOS-проверка отложена** до этапа 14 — на iOS Safari без PWA баннер показывает текст про «Добавить на главный экран».

- [ ] **Step 5: Обновить `plan.md` — отметить этап 12 завершённым**

В `plan.md` в разделе «Этап 12» отметить все подпункты `[x]` и обновить «Текущий статус» внизу файла (этап 12 принят 2026-05-25 или текущая дата прогона).

- [ ] **Step 6: Коммит**

```bash
git add plan.md
git commit -m "этап 12: чекпойнт принят клиентом"
```

---

## ActivityLog — итоговый список новых событий

После этапа 12 в БД появятся следующие `ActivityLog.action`:
- `push.subscription.created`
- `push.subscription.refreshed`
- `push.subscription.removed`
- `push.test_sent`
- `push.queued.<kind>` (для всех 9 видов `PushKind`)

`push.sent.<kind>` **не пишется** — `queued` уже отражает намерение, успех виден по `lastUsedAt`, мёртвые подписки логируются stdout'ом при удалении.
