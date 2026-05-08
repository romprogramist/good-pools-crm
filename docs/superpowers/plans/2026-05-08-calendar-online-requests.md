# Этап 7 — Календарь и онлайн-запись. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервисники планируют визиты (одиночные и серийные) в общем календаре; клиенты отправляют заявки на сервис; сервисник принимает заявку → создаётся визит. Пуши и проверка долга — заглушки до этапов 12 и 13.

**Architecture:** Три новых Prisma-модели (`Visit`, `VisitSeries`, `OnlineRequest`) + 3 enum'а в одной миграции. Server actions в трёх файлах `src/lib/server-actions/`. Календарь — FullCalendar (MIT-плагины daygrid/timegrid/list/interaction) в client-компоненте, импорт через `next/dynamic({ ssr: false })`. Все даты в БД — UTC, рендер — Europe/Moscow.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres, TypeScript strict, Tailwind 4, zod, Auth.js v5, FullCalendar 6 (новые зависимости).

**Связанная спека:** `docs/superpowers/specs/2026-05-08-calendar-online-requests-design.md`

**Project conventions to follow strictly:**
- Server actions: `"use server"`, проверка роли в начале (`requireServicer()` или `requireClient()`), `z.safeParse(formData)`, `redirect` с `?ok=` / `?error=`, `revalidatePath`, `logActivity` для событий и `enqueuePush` для уведомлений.
- Pages: server-components, `<Header />`, `<PageContainer><PageHeader>...`. UI из `src/components/Page.tsx` (`Card`, `FormField`, `Alert`).
- Client-components только там, где обязательно (FullCalendar, autocomplete, форма с условной видимостью).
- Все даты в БД — UTC `DateTime`. Рендер на UI — через `formatMoscow()` хелпер.
- `prisma.$transaction([...])` или `prisma.$transaction(async (tx) => { ... })` для всех многошаговых операций.

---

## Task 0: Установить FullCalendar и обновить package.json

**Files:**
- Modify: `package.json` (auto via npm)
- Modify: `package-lock.json` (auto)

- [ ] **Step 1:** Установить пакеты

```bash
npm install @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction
```

- [ ] **Step 2:** Проверить, что версии записались в `package.json` → секция `dependencies`. Ожидаются строки (версии могут отличаться, должны быть 6.x):

```json
"@fullcalendar/core": "^6.x.x",
"@fullcalendar/daygrid": "^6.x.x",
"@fullcalendar/interaction": "^6.x.x",
"@fullcalendar/list": "^6.x.x",
"@fullcalendar/react": "^6.x.x",
"@fullcalendar/timegrid": "^6.x.x"
```

- [ ] **Step 3:** Type-check проходит

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add package.json package-lock.json
git commit -m "этап 7: deps — FullCalendar (MIT-плагины)"
```

---

## Task 1: Prisma — enums + Visit/VisitSeries/OnlineRequest + миграция

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260508xxxxxx_calendar_init/migration.sql` (auto)

- [ ] **Step 1:** Добавить enum'ы в `prisma/schema.prisma` после существующего `enum ChecklistQuestionType`:

```prisma
enum VisitStatus {
  planned
  in_progress
  completed
  canceled
}

enum VisitKind {
  manual
  online_request
  series
}

enum OnlineRequestStatus {
  pending
  accepted
  declined
}
```

- [ ] **Step 2:** Добавить три модели в конец файла (после `ChecklistQuestion`):

```prisma
model VisitSeries {
  id              String   @id @default(cuid())
  poolId          String
  serviceUserId   String
  startAt         DateTime
  durationMinutes Int      @default(60)
  recurrence      String
  occurrences     Int
  notes           String?
  createdAt       DateTime @default(now())

  pool        Pool   @relation(fields: [poolId], references: [id], onDelete: Cascade)
  serviceUser User   @relation("VisitSeriesServicer", fields: [serviceUserId], references: [id])
  visits      Visit[]

  @@index([poolId])
  @@index([serviceUserId])
}

model Visit {
  id              String      @id @default(cuid())
  poolId          String
  serviceUserId   String
  scheduledAt     DateTime
  durationMinutes Int         @default(60)
  status          VisitStatus @default(planned)
  kind            VisitKind   @default(manual)
  seriesId        String?
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  pool          Pool           @relation(fields: [poolId], references: [id], onDelete: Cascade)
  serviceUser   User           @relation("VisitServicer", fields: [serviceUserId], references: [id])
  series        VisitSeries?   @relation(fields: [seriesId], references: [id], onDelete: SetNull)
  onlineRequest OnlineRequest?

  @@index([poolId])
  @@index([serviceUserId])
  @@index([scheduledAt])
  @@index([seriesId])
}

model OnlineRequest {
  id            String              @id @default(cuid())
  customerId    String
  poolId        String
  desiredFrom   DateTime
  desiredTo     DateTime
  message       String?
  status        OnlineRequestStatus @default(pending)
  acceptedById  String?
  visitId       String?             @unique
  declineReason String?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  pool       Pool     @relation(fields: [poolId], references: [id], onDelete: Cascade)
  acceptedBy User?    @relation("OnlineRequestAcceptedBy", fields: [acceptedById], references: [id])
  visit      Visit?   @relation(fields: [visitId], references: [id], onDelete: SetNull)

  @@index([customerId])
  @@index([poolId])
  @@index([status])
}
```

- [ ] **Step 3:** Добавить обратные связи в существующие модели.

В модель `User` (после строки `activityLog ActivityLog[] @relation("ActivityActor")`):

```prisma
  visitsAsServicer       Visit[]         @relation("VisitServicer")
  visitSeriesAsServicer  VisitSeries[]   @relation("VisitSeriesServicer")
  acceptedRequests       OnlineRequest[] @relation("OnlineRequestAcceptedBy")
```

В модель `Customer` (после `pools Pool[]`):

```prisma
  onlineRequests OnlineRequest[]
```

В модель `Pool` (после `equipment Equipment[]`):

```prisma
  visits         Visit[]
  visitSeries    VisitSeries[]
  onlineRequests OnlineRequest[]
```

- [ ] **Step 4:** Сгенерировать миграцию

```bash
npx prisma migrate dev --name calendar_init
```

Expected: `Applying migration ...calendar_init`, в `prisma/migrations/` появилась новая папка с `migration.sql`. В sql-файле должны быть `CREATE TYPE` для трёх enum'ов и `CREATE TABLE` для `Visit`, `VisitSeries`, `OnlineRequest`.

- [ ] **Step 5:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Commit

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "этап 7: prisma — Visit/VisitSeries/OnlineRequest + enums"
```

---

## Task 2: Хелперы дат и часовой пояс

**Files:**
- Create: `src/lib/calendar/dates.ts`

В проекте уже есть `addMonths`/`addDays` в `src/lib/equipment.ts`. Создаём отдельный модуль для календаря, чтобы не смешивать ответственности; внутри переиспользуем существующие функции.

- [ ] **Step 1:** Создать `src/lib/calendar/dates.ts`:

```ts
import { addDays, addMonths } from "@/lib/equipment";

export type Recurrence = "weekly" | "biweekly" | "monthly";

export function generateOccurrenceDates(
  startAt: Date,
  recurrence: Recurrence,
  occurrences: number,
): Date[] {
  const result: Date[] = [];
  for (let i = 0; i < occurrences; i++) {
    if (recurrence === "weekly") {
      result.push(addDays(startAt, i * 7));
    } else if (recurrence === "biweekly") {
      result.push(addDays(startAt, i * 14));
    } else {
      result.push(addMonths(startAt, i));
    }
  }
  return result;
}

const MOSCOW_TZ = "Europe/Moscow";

export function formatMoscow(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: MOSCOW_TZ,
  }).format(date);
}

export function formatMoscowDate(date: Date): string {
  return formatMoscow(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatMoscowTime(date: Date): string {
  return formatMoscow(date, { hour: "2-digit", minute: "2-digit" });
}

// Parse "YYYY-MM-DDTHH:mm" from <input type="datetime-local"> as Europe/Moscow,
// return a UTC Date.
export function parseMoscowLocalDateTime(input: string): Date {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) throw new Error("Неверный формат даты-времени");
  const [, y, mo, d, h, mi] = m;
  // Europe/Moscow is UTC+3 без перехода на летнее (с 2014).
  // localTime in Moscow = utcTime + 3h, so utcTime = localTime - 3h.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 3, +mi, 0, 0);
  return new Date(utcMs);
}

// Format UTC Date to "YYYY-MM-DDTHH:mm" string в Europe/Moscow для <input type="datetime-local">.
export function formatMoscowLocalDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Ручная проверка краевых дат — открыть `node`:

```bash
node -e "const m = require('./src/lib/calendar/dates'); console.log(m.generateOccurrenceDates(new Date('2026-01-31T07:00:00Z'), 'monthly', 4).map(d => d.toISOString()))"
```

Expected: 4 даты, последовательность 31 янв → 28 фев → 31 марта → 30 апр (или соответствующий ISO-формат UTC).

> Если `node` не запускает TS напрямую — пропусти этот шаг, проверим через приложение в Task 6.

- [ ] **Step 4:** Commit

```bash
git add src/lib/calendar/dates.ts
git commit -m "этап 7: helpers дат и Europe/Moscow"
```

---

## Task 3: Push-заглушка

**Files:**
- Create: `src/lib/push/stub.ts`

- [ ] **Step 1:** Создать `src/lib/push/stub.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PushKind =
  | "new_online_request"
  | "request_accepted"
  | "request_declined"
  | "visit_assigned";

export type PushRecipient = { userId: string };

/**
 * Заглушка пуш-уведомлений на этап 7.
 * Этап 12 заменит реализацию на реальный Web Push — точки вызова не меняются.
 */
export async function enqueuePush(
  kind: PushKind,
  recipients: PushRecipient[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipients.length === 0) return;
  const data = recipients.map((r) => ({
    actorId: null,
    action: `push.queued.${kind}`,
    entityType: "User",
    entityId: r.userId,
    diff: payload as Prisma.InputJsonValue,
  }));
  await prisma.activityLog.createMany({ data });
  for (const r of recipients) {
    console.log(`[push-stub] ${kind} → user ${r.userId}`, payload);
  }
}

/** Все активные admin+service для push — кому уходит 'new_online_request' и 'visit_assigned'. */
export async function listAdminAndServiceRecipients(): Promise<PushRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    select: { id: true },
  });
  return users.map((u) => ({ userId: u.id }));
}

/** Получить userId владельца Customer (для push-уведомлений клиенту). */
export async function getCustomerUserId(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  return c?.userId ?? null;
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/push/stub.ts
git commit -m "этап 7: push-заглушка через ActivityLog + console.log"
```

---

## Task 4: Заглушка проверки долга

**Files:**
- Create: `src/lib/payments/debt.ts`

- [ ] **Step 1:** Создать `src/lib/payments/debt.ts`:

```ts
/**
 * Заглушка проверки долга клиента.
 * В этапе 7 всегда возвращает false — клиент может отправить онлайн-заявку.
 * Этап 13 переписывает реализацию: сумма всех Visit со статусом unpaid.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function hasUnpaidDebt(customerId: string): Promise<boolean> {
  return false;
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/payments/debt.ts
git commit -m "этап 7: заглушка проверки долга (полная реализация — этап 13)"
```

---

## Task 5: Server actions — visits.ts

**Files:**
- Create: `src/lib/server-actions/visits.ts`

- [ ] **Step 1:** Создать файл с тремя экшенами + двумя read-функциями.

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { VisitStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush } from "@/lib/push/stub";

async function requireServicer() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const VisitInputSchema = z.object({
  poolId: z.string().min(1, "Бассейн обязателен"),
  serviceUserId: z.string().min(1, "Сервисник обязателен"),
  scheduledAt: z.date(),
  durationMinutes: z.number().int().min(5).max(24 * 60 - 1),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type VisitConflict = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  customerName: string;
  poolName: string;
};

async function validateVisitInput(input: z.infer<typeof VisitInputSchema>) {
  if (input.scheduledAt.getTime() < Date.now() - SEVEN_DAYS_MS) {
    throw new Error("Дата визита не может быть раньше чем 7 дней назад");
  }
  const pool = await prisma.pool.findUnique({ where: { id: input.poolId } });
  if (!pool) throw new Error("Бассейн не найден");
  const user = await prisma.user.findUnique({
    where: { id: input.serviceUserId },
  });
  if (!user || !user.active || (user.role !== "admin" && user.role !== "service")) {
    throw new Error("Исполнитель недоступен");
  }
}

export async function checkVisitConflicts(input: {
  serviceUserId: string;
  scheduledAt: Date;
  durationMinutes: number;
  excludeVisitId?: string;
}): Promise<VisitConflict[]> {
  await requireServicer();
  const start = input.scheduledAt;
  const end = new Date(start.getTime() + input.durationMinutes * 60 * 1000);
  const candidates = await prisma.visit.findMany({
    where: {
      serviceUserId: input.serviceUserId,
      status: { in: ["planned", "in_progress"] },
      id: input.excludeVisitId ? { not: input.excludeVisitId } : undefined,
      // Грубая отсечка по времени — точная в JS ниже
      scheduledAt: {
        gte: new Date(start.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(end.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    include: {
      pool: { include: { customer: { select: { fullName: true } } } },
    },
  });
  return candidates
    .filter((v) => {
      const vStart = v.scheduledAt.getTime();
      const vEnd = vStart + v.durationMinutes * 60 * 1000;
      return vStart < end.getTime() && vEnd > start.getTime();
    })
    .map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt,
      durationMinutes: v.durationMinutes,
      customerName: v.pool.customer.fullName,
      poolName: v.pool.name,
    }));
}

export async function createVisitAction(formData: FormData) {
  const actor = await requireServicer();
  const data = {
    poolId: String(formData.get("poolId") ?? ""),
    serviceUserId: String(formData.get("serviceUserId") ?? ""),
    scheduledAt: new Date(String(formData.get("scheduledAt") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = VisitInputSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/service/calendar?error=${encodeURIComponent(msg)}`);
  }
  await validateVisitInput(parsed.data);

  const visit = await prisma.visit.create({
    data: {
      poolId: parsed.data.poolId,
      serviceUserId: parsed.data.serviceUserId,
      scheduledAt: parsed.data.scheduledAt,
      durationMinutes: parsed.data.durationMinutes,
      status: "planned",
      kind: "manual",
      notes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.create",
    entityType: "Visit",
    entityId: visit.id,
    diff: {
      poolId: visit.poolId,
      serviceUserId: visit.serviceUserId,
      scheduledAt: visit.scheduledAt.toISOString(),
      durationMinutes: visit.durationMinutes,
      kind: visit.kind,
    },
  });

  await enqueuePush(
    "visit_assigned",
    [{ userId: visit.serviceUserId }],
    { visitId: visit.id, scheduledAt: visit.scheduledAt.toISOString() },
  );

  revalidatePath("/service/calendar");
  redirect(`/service/visits/${visit.id}?ok=${encodeURIComponent("Визит создан")}`);
}

const UpdateVisitSchema = z.object({
  id: z.string().min(1),
  poolId: z.string().min(1),
  serviceUserId: z.string().min(1),
  scheduledAt: z.date(),
  durationMinutes: z.number().int().min(5).max(24 * 60 - 1),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function updateVisitAction(formData: FormData) {
  const actor = await requireServicer();
  const data = {
    id: String(formData.get("id") ?? ""),
    poolId: String(formData.get("poolId") ?? ""),
    serviceUserId: String(formData.get("serviceUserId") ?? ""),
    scheduledAt: new Date(String(formData.get("scheduledAt") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = UpdateVisitSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/service/visits/${data.id}?error=${encodeURIComponent(msg)}`);
  }
  const before = await prisma.visit.findUnique({ where: { id: parsed.data.id } });
  if (!before) {
    redirect(`/service/calendar?error=${encodeURIComponent("Визит не найден")}`);
  }
  await validateVisitInput(parsed.data);

  await prisma.visit.update({
    where: { id: parsed.data.id },
    data: {
      poolId: parsed.data.poolId,
      serviceUserId: parsed.data.serviceUserId,
      scheduledAt: parsed.data.scheduledAt,
      durationMinutes: parsed.data.durationMinutes,
      notes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.update",
    entityType: "Visit",
    entityId: before.id,
    diff: {
      before: {
        poolId: before.poolId,
        serviceUserId: before.serviceUserId,
        scheduledAt: before.scheduledAt.toISOString(),
        durationMinutes: before.durationMinutes,
      },
      after: {
        poolId: parsed.data.poolId,
        serviceUserId: parsed.data.serviceUserId,
        scheduledAt: parsed.data.scheduledAt.toISOString(),
        durationMinutes: parsed.data.durationMinutes,
      },
    },
  });

  revalidatePath("/service/calendar");
  revalidatePath(`/service/visits/${before.id}`);
  redirect(`/service/visits/${before.id}?ok=${encodeURIComponent("Сохранено")}`);
}

export async function cancelVisitAction(formData: FormData) {
  const actor = await requireServicer();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!id) {
    redirect(`/service/calendar?error=${encodeURIComponent("Не указан визит")}`);
  }
  const before = await prisma.visit.findUnique({ where: { id } });
  if (!before) {
    redirect(`/service/calendar?error=${encodeURIComponent("Визит не найден")}`);
  }
  if (before.status === "canceled" || before.status === "completed") {
    redirect(`/service/visits/${id}?error=${encodeURIComponent("Визит уже завершён или отменён")}`);
  }

  await prisma.visit.update({
    where: { id },
    data: {
      status: "canceled" as VisitStatus,
      notes: reason
        ? (before.notes ? before.notes + "\n\n[Отмена]: " + reason : "[Отмена]: " + reason)
        : before.notes,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.cancel",
    entityType: "Visit",
    entityId: id,
    diff: { reason: reason || null },
  });

  revalidatePath("/service/calendar");
  revalidatePath(`/service/visits/${id}`);
  redirect(`/service/calendar?ok=${encodeURIComponent("Визит отменён")}`);
}

export async function getVisitsInRange(
  from: Date,
  to: Date,
  filter?: { serviceUserId?: string },
) {
  await requireServicer();
  return prisma.visit.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      status: { in: ["planned", "in_progress", "completed"] },
      serviceUserId: filter?.serviceUserId,
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      pool: {
        select: {
          id: true,
          name: true,
          address: true,
          customer: { select: { id: true, fullName: true } },
        },
      },
      serviceUser: { select: { id: true, name: true } },
    },
  });
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visits.ts
git commit -m "этап 7: server actions — visits (create/update/cancel/conflicts/range)"
```

---

## Task 6: Server actions — visit-series.ts

**Files:**
- Create: `src/lib/server-actions/visit-series.ts`

- [ ] **Step 1:** Создать файл:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush } from "@/lib/push/stub";
import { generateOccurrenceDates } from "@/lib/calendar/dates";

async function requireServicer() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const SeriesSchema = z.object({
  poolId: z.string().min(1, "Бассейн обязателен"),
  serviceUserId: z.string().min(1, "Сервисник обязателен"),
  startAt: z.date(),
  durationMinutes: z.number().int().min(5).max(24 * 60 - 1),
  recurrence: z.enum(["weekly", "biweekly", "monthly"]),
  occurrences: z.number().int().min(2).max(52),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function createVisitSeriesAction(formData: FormData) {
  const actor = await requireServicer();
  const data = {
    poolId: String(formData.get("poolId") ?? ""),
    serviceUserId: String(formData.get("serviceUserId") ?? ""),
    startAt: new Date(String(formData.get("scheduledAt") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    recurrence: String(formData.get("recurrence") ?? "weekly") as "weekly" | "biweekly" | "monthly",
    occurrences: Number(formData.get("occurrences") ?? 4),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = SeriesSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/service/calendar?error=${encodeURIComponent(msg)}`);
  }

  const pool = await prisma.pool.findUnique({ where: { id: parsed.data.poolId } });
  if (!pool) {
    redirect(`/service/calendar?error=${encodeURIComponent("Бассейн не найден")}`);
  }
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.serviceUserId },
  });
  if (!user || !user.active || (user.role !== "admin" && user.role !== "service")) {
    redirect(`/service/calendar?error=${encodeURIComponent("Исполнитель недоступен")}`);
  }

  const dates = generateOccurrenceDates(
    parsed.data.startAt,
    parsed.data.recurrence,
    parsed.data.occurrences,
  );

  const series = await prisma.$transaction(async (tx) => {
    const s = await tx.visitSeries.create({
      data: {
        poolId: parsed.data.poolId,
        serviceUserId: parsed.data.serviceUserId,
        startAt: parsed.data.startAt,
        durationMinutes: parsed.data.durationMinutes,
        recurrence: parsed.data.recurrence,
        occurrences: parsed.data.occurrences,
        notes: parsed.data.notes || null,
      },
    });
    await tx.visit.createMany({
      data: dates.map((d) => ({
        poolId: parsed.data.poolId,
        serviceUserId: parsed.data.serviceUserId,
        scheduledAt: d,
        durationMinutes: parsed.data.durationMinutes,
        status: "planned" as const,
        kind: "series" as const,
        seriesId: s.id,
        notes: parsed.data.notes || null,
      })),
    });
    return s;
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.series.create",
    entityType: "VisitSeries",
    entityId: series.id,
    diff: {
      poolId: series.poolId,
      serviceUserId: series.serviceUserId,
      recurrence: series.recurrence,
      occurrences: series.occurrences,
      startAt: series.startAt.toISOString(),
    },
  });

  await enqueuePush(
    "visit_assigned",
    [{ userId: series.serviceUserId }],
    { seriesId: series.id, count: series.occurrences },
  );

  revalidatePath("/service/calendar");
  redirect(`/service/calendar?ok=${encodeURIComponent("Серия создана")}`);
}

export async function cancelSeriesAction(formData: FormData) {
  const actor = await requireServicer();
  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(`/service/calendar?error=${encodeURIComponent("Не указана серия")}`);
  }
  const series = await prisma.visitSeries.findUnique({ where: { id } });
  if (!series) {
    redirect(`/service/calendar?error=${encodeURIComponent("Серия не найдена")}`);
  }

  const result = await prisma.visit.updateMany({
    where: {
      seriesId: id,
      status: "planned",
      scheduledAt: { gte: new Date() },
    },
    data: { status: "canceled" },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.series.cancel",
    entityType: "VisitSeries",
    entityId: id,
    diff: { canceledCount: result.count },
  });

  revalidatePath("/service/calendar");
  redirect(`/service/calendar?ok=${encodeURIComponent(`Отменено визитов: ${result.count}`)}`);
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-series.ts
git commit -m "этап 7: server actions — серии визитов"
```

---

## Task 7: Server actions — online-requests.ts

**Files:**
- Create: `src/lib/server-actions/online-requests.ts`

- [ ] **Step 1:** Создать файл:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import {
  enqueuePush,
  getCustomerUserId,
  listAdminAndServiceRecipients,
} from "@/lib/push/stub";
import { hasUnpaidDebt } from "@/lib/payments/debt";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Не авторизован");
  return session.user;
}

async function requireClient() {
  const user = await requireSession();
  if (user.role !== "client") throw new Error("Доступ запрещён");
  const customer = await prisma.customer.findUnique({
    where: { userId: user.id },
  });
  if (!customer) throw new Error("Профиль клиента не найден");
  return { user, customer };
}

async function requireServicer() {
  const user = await requireSession();
  if (user.role !== "admin" && user.role !== "service") {
    throw new Error("Доступ запрещён");
  }
  return user;
}

async function requireAdmin() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Доступ запрещён");
  return user;
}

const CreateRequestSchema = z
  .object({
    poolId: z.string().min(1, "Бассейн обязателен"),
    desiredFrom: z.date(),
    desiredTo: z.date(),
    message: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.desiredTo.getTime() < val.desiredFrom.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Дата окончания не раньше даты начала",
        path: ["desiredTo"],
      });
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (val.desiredFrom.getTime() < todayStart.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Желаемая дата не может быть в прошлом",
        path: ["desiredFrom"],
      });
    }
  });

export async function createOnlineRequestAction(formData: FormData) {
  const { customer } = await requireClient();
  const data = {
    poolId: String(formData.get("poolId") ?? ""),
    desiredFrom: new Date(String(formData.get("desiredFrom") ?? "")),
    desiredTo: new Date(String(formData.get("desiredTo") ?? "")),
    message: String(formData.get("message") ?? ""),
  };
  const parsed = CreateRequestSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/client/request-visit?error=${encodeURIComponent(msg)}`);
  }

  const pool = await prisma.pool.findUnique({
    where: { id: parsed.data.poolId },
    select: { id: true, customerId: true },
  });
  if (!pool || pool.customerId !== customer.id) {
    redirect(`/client/request-visit?error=${encodeURIComponent("Бассейн не найден")}`);
  }

  if (await hasUnpaidDebt(customer.id)) {
    redirect(
      `/client/request-visit?error=${encodeURIComponent("Оплатите предыдущий визит, прежде чем отправлять новую заявку")}`,
    );
  }

  const req = await prisma.onlineRequest.create({
    data: {
      customerId: customer.id,
      poolId: parsed.data.poolId,
      desiredFrom: parsed.data.desiredFrom,
      desiredTo: parsed.data.desiredTo,
      message: parsed.data.message || null,
      status: "pending",
    },
  });

  await logActivity({
    actorId: customer.userId,
    action: "online_request.create",
    entityType: "OnlineRequest",
    entityId: req.id,
    diff: {
      poolId: req.poolId,
      desiredFrom: req.desiredFrom.toISOString(),
      desiredTo: req.desiredTo.toISOString(),
    },
  });

  const recipients = await listAdminAndServiceRecipients();
  await enqueuePush("new_online_request", recipients, {
    requestId: req.id,
    customerId: req.customerId,
    poolId: req.poolId,
  });

  revalidatePath("/client/requests");
  revalidatePath("/service/online-requests");
  redirect(`/client/requests?ok=${encodeURIComponent("Заявка отправлена")}`);
}

const AcceptSchema = z.object({
  requestId: z.string().min(1),
  serviceUserId: z.string().min(1),
  scheduledAt: z.date(),
  durationMinutes: z.number().int().min(5).max(24 * 60 - 1),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function acceptOnlineRequestAction(formData: FormData) {
  const actor = await requireServicer();
  const data = {
    requestId: String(formData.get("requestId") ?? ""),
    serviceUserId: String(formData.get("serviceUserId") ?? ""),
    scheduledAt: new Date(String(formData.get("scheduledAt") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = AcceptSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    redirect(`/service/online-requests?error=${encodeURIComponent(msg)}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.serviceUserId },
  });
  if (!user || !user.active || (user.role !== "admin" && user.role !== "service")) {
    redirect(`/service/online-requests?error=${encodeURIComponent("Исполнитель недоступен")}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.onlineRequest.findUnique({
      where: { id: parsed.data.requestId },
    });
    if (!req) throw new Error("Заявка не найдена");
    if (req.status !== "pending") {
      throw new Error("Заявка уже обработана");
    }

    const visit = await tx.visit.create({
      data: {
        poolId: req.poolId,
        serviceUserId: parsed.data.serviceUserId,
        scheduledAt: parsed.data.scheduledAt,
        durationMinutes: parsed.data.durationMinutes,
        status: "planned",
        kind: "online_request",
        notes: parsed.data.notes || null,
      },
    });

    const updated = await tx.onlineRequest.update({
      where: { id: parsed.data.requestId },
      data: {
        status: "accepted",
        acceptedById: actor.id,
        visitId: visit.id,
      },
    });

    return { visit, request: updated };
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : "Ошибка приёмки заявки";
    redirect(`/service/online-requests?error=${encodeURIComponent(msg)}`);
  });

  if (!result) return; // редирект уже сделан в catch

  await logActivity({
    actorId: actor.id,
    action: "online_request.accept",
    entityType: "OnlineRequest",
    entityId: result.request.id,
    diff: {
      visitId: result.visit.id,
      scheduledAt: result.visit.scheduledAt.toISOString(),
      serviceUserId: result.visit.serviceUserId,
    },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.create",
    entityType: "Visit",
    entityId: result.visit.id,
    diff: { fromOnlineRequest: result.request.id },
  });

  const clientUserId = await getCustomerUserId(result.request.customerId);
  if (clientUserId) {
    await enqueuePush(
      "request_accepted",
      [{ userId: clientUserId }],
      {
        requestId: result.request.id,
        visitId: result.visit.id,
        scheduledAt: result.visit.scheduledAt.toISOString(),
      },
    );
  }

  revalidatePath("/service/online-requests");
  revalidatePath("/service/calendar");
  revalidatePath("/client/requests");
  redirect(`/service/visits/${result.visit.id}?ok=${encodeURIComponent("Заявка принята, визит создан")}`);
}

const DeclineSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function declineOnlineRequestAction(formData: FormData) {
  const actor = await requireAdmin();
  const data = {
    requestId: String(formData.get("requestId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };
  const parsed = DeclineSchema.safeParse(data);
  if (!parsed.success) {
    redirect(`/service/online-requests?error=${encodeURIComponent("Не указана заявка")}`);
  }

  const req = await prisma.onlineRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req) {
    redirect(`/service/online-requests?error=${encodeURIComponent("Заявка не найдена")}`);
  }
  if (req.status !== "pending") {
    redirect(`/service/online-requests?error=${encodeURIComponent("Заявка уже обработана")}`);
  }

  await prisma.onlineRequest.update({
    where: { id: req.id },
    data: {
      status: "declined",
      acceptedById: actor.id,
      declineReason: parsed.data.reason || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "online_request.decline",
    entityType: "OnlineRequest",
    entityId: req.id,
    diff: { reason: parsed.data.reason || null },
  });

  const clientUserId = await getCustomerUserId(req.customerId);
  if (clientUserId) {
    await enqueuePush(
      "request_declined",
      [{ userId: clientUserId }],
      { requestId: req.id, reason: parsed.data.reason || null },
    );
  }

  revalidatePath("/service/online-requests");
  revalidatePath("/client/requests");
  redirect(`/service/online-requests?ok=${encodeURIComponent("Заявка отклонена")}`);
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/online-requests.ts
git commit -m "этап 7: server actions — онлайн-заявки (создание/приёмка/отклонение)"
```

---

## Task 8: Компонент `<VisitForm />`

**Files:**
- Create: `src/components/calendar/VisitForm.tsx`

Используется в трёх местах:
1. Создание визита из календаря (modal-like, `<dialog>` или inline-карточка).
2. Редактирование существующего визита на `/service/visits/[id]`.
3. Приёмка online-заявки на `/service/online-requests`.

В режиме «приёмка» поля `customerId`/`poolId` read-only (предзаполнены), чекбокс серии скрыт. В режиме «редактирование» чекбокс серии тоже скрыт. Submit идёт в разные server actions через `formAction` атрибут на кнопках или через скрытое поле `mode`.

- [ ] **Step 1:** Создать `src/components/calendar/VisitForm.tsx`. Это client-component:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, FormField } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoscowLocalDateTime } from "@/lib/calendar/dates";

type CustomerOpt = { id: string; fullName: string; pools: { id: string; name: string }[] };
type ServiceUserOpt = { id: string; name: string | null };

type Conflict = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  customerName: string;
  poolName: string;
};

export type VisitFormMode =
  | { kind: "create"; createAction: (fd: FormData) => void; createSeriesAction: (fd: FormData) => void; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number }) => Promise<Conflict[]> }
  | { kind: "edit"; visitId: string; updateAction: (fd: FormData) => void; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number; excludeVisitId: string }) => Promise<Conflict[]> }
  | { kind: "accept"; requestId: string; acceptAction: (fd: FormData) => void; lockedCustomer: { id: string; fullName: string }; lockedPool: { id: string; name: string }; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number }) => Promise<Conflict[]> };

type Props = {
  mode: VisitFormMode;
  customers: CustomerOpt[]; // для create / edit
  serviceUsers: ServiceUserOpt[];
  defaults?: {
    customerId?: string;
    poolId?: string;
    serviceUserId?: string;
    scheduledAt?: Date;
    durationMinutes?: number;
    notes?: string;
  };
};

export function VisitForm({ mode, customers, serviceUsers, defaults }: Props) {
  const [customerId, setCustomerId] = useState(defaults?.customerId ?? customers[0]?.id ?? "");
  const initialPools =
    customers.find((c) => c.id === customerId)?.pools ?? [];
  const [poolId, setPoolId] = useState(defaults?.poolId ?? initialPools[0]?.id ?? "");
  const [serviceUserId, setServiceUserId] = useState(
    defaults?.serviceUserId ?? serviceUsers[0]?.id ?? "",
  );
  const [scheduledAt, setScheduledAt] = useState(
    defaults?.scheduledAt
      ? formatMoscowLocalDateTime(defaults.scheduledAt)
      : formatMoscowLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [durationMinutes, setDurationMinutes] = useState(defaults?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [withSeries, setWithSeries] = useState(false);
  const [recurrence, setRecurrence] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [occurrences, setOccurrences] = useState(4);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const showCustomerSelect = mode.kind !== "accept";
  const allowSeries = mode.kind === "create";

  const pools = useMemo(() => {
    if (mode.kind === "accept") return [mode.lockedPool];
    return customers.find((c) => c.id === customerId)?.pools ?? [];
  }, [customerId, customers, mode]);

  useEffect(() => {
    if (mode.kind === "accept") return;
    if (!pools.find((p) => p.id === poolId)) {
      setPoolId(pools[0]?.id ?? "");
    }
  }, [pools, poolId, mode.kind]);

  async function runConflictCheck() {
    setBusy(true);
    try {
      const input = { serviceUserId, scheduledAt, durationMinutes };
      const res =
        mode.kind === "edit"
          ? await mode.checkConflicts({ ...input, excludeVisitId: mode.visitId })
          : await mode.checkConflicts(input);
      setConflicts(res);
      setConfirming(res.length > 0);
      if (res.length === 0) {
        return true; // готовы к submit
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form
        onSubmit={async (e) => {
          if (confirming) return; // следующий submit пройдёт уже без чека
          e.preventDefault();
          const ok = await runConflictCheck();
          if (ok) {
            (e.currentTarget as HTMLFormElement).submit();
          }
        }}
        action={
          mode.kind === "create"
            ? withSeries ? mode.createSeriesAction : mode.createAction
            : mode.kind === "edit"
              ? mode.updateAction
              : mode.acceptAction
        }
        className="flex flex-col gap-4"
      >
        {mode.kind === "edit" && <input type="hidden" name="id" value={mode.visitId} />}
        {mode.kind === "accept" && (
          <input type="hidden" name="requestId" value={mode.requestId} />
        )}

        {showCustomerSelect ? (
          <FormField label="Клиент" htmlFor="customerId">
            <select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <div className="text-sm text-zinc-600">
            Клиент: <strong>{(mode as { lockedCustomer: { fullName: string } }).lockedCustomer.fullName}</strong>
          </div>
        )}

        <FormField label="Бассейн" htmlFor="poolId">
          <select
            id="poolId"
            name="poolId"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            disabled={mode.kind === "accept"}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            required
          >
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Сервисник" htmlFor="serviceUserId">
          <select
            id="serviceUserId"
            name="serviceUserId"
            value={serviceUserId}
            onChange={(e) => setServiceUserId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            required
          >
            {serviceUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.id}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Дата и время начала" htmlFor="scheduledAt">
          <Input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Длительность (мин)" htmlFor="durationMinutes">
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={1439}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            required
          />
        </FormField>

        <FormField label="Заметки" htmlFor="notes">
          <textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </FormField>

        {allowSeries && (
          <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withSeries}
                onChange={(e) => setWithSeries(e.target.checked)}
              />
              Серия повторов
            </label>
            {withSeries && (
              <>
                <FormField label="Период" htmlFor="recurrence">
                  <select
                    id="recurrence"
                    name="recurrence"
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(e.target.value as "weekly" | "biweekly" | "monthly")
                    }
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="weekly">Еженедельно</option>
                    <option value="biweekly">Раз в две недели</option>
                    <option value="monthly">Ежемесячно</option>
                  </select>
                </FormField>
                <FormField label="Количество повторов" htmlFor="occurrences">
                  <Input
                    id="occurrences"
                    name="occurrences"
                    type="number"
                    min={2}
                    max={52}
                    value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                  />
                </FormField>
              </>
            )}
          </div>
        )}

        {conflicts && conflicts.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <strong>У сервисника уже есть визиты в это время:</strong>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c.id}>
                  {new Date(c.scheduledAt).toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  — {c.customerName} / {c.poolName} ({c.durationMinutes} мин)
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={busy}>
            {confirming ? "Всё равно создать" : busy ? "Проверка…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/components/calendar/VisitForm.tsx
git commit -m "этап 7: <VisitForm /> — общая форма create/edit/accept"
```

---

## Task 9: Календарь `/service/calendar` (страница + CalendarView)

**Files:**
- Create: `src/app/service/calendar/page.tsx`
- Create: `src/components/calendar/CalendarView.tsx`

- [ ] **Step 1:** Создать `src/components/calendar/CalendarView.tsx`. Client-component с FullCalendar:

```tsx
"use client";

import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";

export type CalendarVisit = {
  id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  serviceUserId: string;
  serviceUserName: string;
  customerName: string;
  poolName: string;
  status: "planned" | "in_progress" | "completed";
};

const PALETTE = [
  "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444",
  "#a855f7", "#14b8a6", "#ec4899", "#6366f1",
];

function colorFor(serviceUserId: string): string {
  let h = 0;
  for (let i = 0; i < serviceUserId.length; i++) {
    h = (h * 31 + serviceUserId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function CalendarView({
  visits,
  initialView = "timeGridWeek",
  initialDate,
}: {
  visits: CalendarVisit[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";
  initialDate?: string;
}) {
  const router = useRouter();
  const events = visits.map((v) => ({
    id: v.id,
    title: `${v.customerName} — ${v.poolName}\n${v.serviceUserName}`,
    start: v.start,
    end: v.end,
    backgroundColor: colorFor(v.serviceUserId),
    borderColor: colorFor(v.serviceUserId),
    extendedProps: { status: v.status },
  }));

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={initialView}
      initialDate={initialDate}
      locale="ru"
      firstDay={1}
      timeZone="Europe/Moscow"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      }}
      buttonText={{
        today: "Сегодня",
        month: "Месяц",
        week: "Неделя",
        day: "День",
        list: "Список",
      }}
      events={events}
      eventClick={(info) => router.push(`/service/visits/${info.event.id}`)}
      dateClick={(info) =>
        router.push(`/service/calendar/new?date=${encodeURIComponent(info.dateStr)}`)
      }
      height="auto"
    />
  );
}
```

- [ ] **Step 2:** Создать `src/app/service/calendar/page.tsx`:

```tsx
import dynamic from "next/dynamic";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { getVisitsInRange } from "@/lib/server-actions/visits";

const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView").then((m) => m.CalendarView),
  { ssr: false, loading: () => <Card><p className="text-sm text-zinc-500">Загрузка календаря…</p></Card> },
);

type SP = Promise<{ ok?: string; error?: string; date?: string; view?: string; servicer?: string }>;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // Берём диапазон ±60 дней от текущей даты — достаточно для месячного/недельного вида.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const visits = await getVisitsInRange(from, to, {
    serviceUserId: sp.servicer && sp.servicer !== "all" ? sp.servicer : undefined,
  });

  const calendarVisits = visits.map((v) => ({
    id: v.id,
    title: `${v.pool.customer.fullName} — ${v.pool.name}`,
    start: v.scheduledAt.toISOString(),
    end: new Date(
      v.scheduledAt.getTime() + v.durationMinutes * 60 * 1000,
    ).toISOString(),
    serviceUserId: v.serviceUserId,
    serviceUserName: v.serviceUser.name ?? "—",
    customerName: v.pool.customer.fullName,
    poolName: v.pool.name,
    status: v.status as "planned" | "in_progress" | "completed",
  }));

  const view =
    sp.view === "dayGridMonth" || sp.view === "timeGridDay" || sp.view === "listWeek"
      ? sp.view
      : "timeGridWeek";

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Календарь визитов"
          subtitle="Все визиты всех сервисников"
          actions={
            <Link href="/service/calendar/new">
              <Button>+ Визит</Button>
            </Link>
          }
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <div className="mt-6">
          <CalendarView visits={calendarVisits} initialView={view} initialDate={sp.date} />
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 3:** Поднять dev-сервер и проверить вручную.

```bash
npm run dev
```

Открыть `http://localhost:3000/service/calendar` (логиниться как admin или service). Ожидается:
- Шапка «Календарь визитов»
- Кнопка «+ Визит» (ведёт на `/service/calendar/new` — её сделаем в Task 10)
- Сетка FullCalendar с переключателями Месяц/Неделя/День/Список
- Локаль русская, неделя начинается с понедельника
- Пустой календарь (визитов ещё нет)

- [ ] **Step 4:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit

```bash
git add src/components/calendar/CalendarView.tsx src/app/service/calendar/page.tsx
git commit -m "этап 7: /service/calendar + <CalendarView /> через FullCalendar"
```

---

## Task 10: Страница создания визита `/service/calendar/new`

**Files:**
- Create: `src/app/service/calendar/new/page.tsx`

- [ ] **Step 1:** Создать страницу:

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import {
  createVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import { createVisitSeriesAction } from "@/lib/server-actions/visit-series";

type SP = Promise<{ date?: string }>;

export default async function NewVisitPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const customers = await prisma.customer.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      pools: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  const serviceUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const defaultDate = sp.date ? new Date(sp.date + "T10:00:00") : undefined;

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader title="Новый визит" subtitle="Создание визита или серии" />
        <div className="mt-6">
          <VisitForm
            mode={{
              kind: "create",
              createAction: createVisitAction,
              createSeriesAction: createVisitSeriesAction,
              checkConflicts: checkAction,
            }}
            customers={customers.filter((c) => c.pools.length > 0)}
            serviceUsers={serviceUsers}
            defaults={{
              serviceUserId: session.user.id,
              scheduledAt: defaultDate,
            }}
          />
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Ручная проверка:
  1. Открыть `http://localhost:3000/service/calendar/new`
  2. Выбрать клиента/бассейн/сервисника, дату на завтра 14:00, 60 мин, заметки «тест»
  3. Submit → редирект на `/service/visits/<id>?ok=Визит создан` (страница `/service/visits/[id]` появится в Task 11; пока 404 — это ОК, главное что URL в адресной строке корректный)
  4. Зайти на `/service/calendar` → визит виден в недельной сетке
  5. Создать ещё один визит на тот же слот того же сервисника → форма показывает warning, кнопка превращается в «Всё равно создать», после второго submit визит создаётся

- [ ] **Step 4:** Commit

```bash
git add src/app/service/calendar/new/page.tsx
git commit -m "этап 7: /service/calendar/new — форма создания визита/серии"
```

---

## Task 11: Карточка визита `/service/visits/[id]`

**Files:**
- Create: `src/app/service/visits/[id]/page.tsx`

Минимальная карточка визита: показывает данные, форма редактирования, кнопка «Отменить визит». Заполнение чек-листа, фото, химия — в этапе 8.

- [ ] **Step 1:** Создать страницу:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import {
  updateVisitAction,
  cancelVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import { formatMoscow } from "@/lib/calendar/dates";

type Params = Promise<{ id: string }>;
type SP = Promise<{ ok?: string; error?: string }>;

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: {
        select: {
          id: true,
          name: true,
          address: true,
          customer: { select: { id: true, fullName: true } },
        },
      },
      serviceUser: { select: { id: true, name: true } },
      series: { select: { id: true, recurrence: true, occurrences: true } },
      onlineRequest: { select: { id: true } },
    },
  });

  if (!visit) {
    return (
      <>
        <Header />
        <PageContainer>
          <PageHeader title="Визит не найден" />
          <div className="mt-6">
            <Alert variant="error">Этот визит не существует или был удалён.</Alert>
          </div>
          <div className="mt-4">
            <Link href="/service/calendar">
              <Button variant="secondary">← В календарь</Button>
            </Link>
          </div>
        </PageContainer>
      </>
    );
  }

  const customers = await prisma.customer.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      pools: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  const serviceUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
    excludeVisitId: string;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
        excludeVisitId: input.excludeVisitId,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  const editable = visit.status === "planned" || visit.status === "in_progress";

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title={`Визит ${formatMoscow(visit.scheduledAt)}`}
          subtitle={`${visit.pool.customer.fullName} — ${visit.pool.name}`}
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <Card className="mt-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500">Статус</dt>
            <dd>{visit.status}</dd>
            <dt className="text-zinc-500">Тип</dt>
            <dd>{visit.kind}</dd>
            <dt className="text-zinc-500">Сервисник</dt>
            <dd>{visit.serviceUser.name ?? "—"}</dd>
            <dt className="text-zinc-500">Длительность</dt>
            <dd>{visit.durationMinutes} мин</dd>
            {visit.series && (
              <>
                <dt className="text-zinc-500">Серия</dt>
                <dd>
                  {visit.series.recurrence}, {visit.series.occurrences} повторов
                </dd>
              </>
            )}
            {visit.onlineRequest && (
              <>
                <dt className="text-zinc-500">Из онлайн-заявки</dt>
                <dd>#{visit.onlineRequest.id.slice(0, 8)}</dd>
              </>
            )}
          </dl>
        </Card>

        {editable && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Редактирование</h2>
            <VisitForm
              mode={{
                kind: "edit",
                visitId: visit.id,
                updateAction: updateVisitAction,
                checkConflicts: checkAction,
              }}
              customers={customers}
              serviceUsers={serviceUsers}
              defaults={{
                customerId: visit.pool.customer.id,
                poolId: visit.poolId,
                serviceUserId: visit.serviceUserId,
                scheduledAt: visit.scheduledAt,
                durationMinutes: visit.durationMinutes,
                notes: visit.notes ?? "",
              }}
            />
          </div>
        )}

        {editable && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Отмена визита</h2>
            <form action={cancelVisitAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={visit.id} />
              <textarea
                name="reason"
                rows={2}
                placeholder="Причина (необязательно)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="destructive">Отменить визит</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <Link href="/service/calendar">
            <Button variant="secondary">← В календарь</Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Проверить, есть ли в `src/components/ui/button.tsx` варианты `secondary` и `destructive`. Если их нет — открыть файл и добавить, либо заменить на существующий вариант (`variant="outline"` / без variant).

```bash
npx tsc --noEmit
```

Expected: 0 errors. Если ошибки про варианты `secondary`/`destructive` — поправить в этой странице на доступные варианты, ничего нового в `button.tsx` не добавлять.

- [ ] **Step 3:** Ручная проверка:
  1. Открыть `/service/calendar` → клик по созданному ранее визиту → попадаем на `/service/visits/<id>`
  2. Видна карточка с деталями
  3. Меняем длительность на 90 мин → submit → редирект с `?ok=Сохранено`, в календаре блок стал выше
  4. Клик «Отменить визит» с причиной «тест отмены» → редирект на `/service/calendar?ok=Визит отменён`, визит исчезает (т.к. `getVisitsInRange` отфильтровывает `canceled`)

- [ ] **Step 4:** Commit

```bash
git add src/app/service/visits/[id]/page.tsx
git commit -m "этап 7: /service/visits/[id] — карточка визита, edit/cancel"
```

---

## Task 12: Раздел онлайн-заявок `/service/online-requests`

**Files:**
- Create: `src/app/service/online-requests/page.tsx`
- Create: `src/app/service/online-requests/[id]/accept/page.tsx`

- [ ] **Step 1:** Создать список заявок `src/app/service/online-requests/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscowDate } from "@/lib/calendar/dates";
import { declineOnlineRequestAction } from "@/lib/server-actions/online-requests";

type SP = Promise<{ ok?: string; error?: string; tab?: string }>;

export default async function OnlineRequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }
  const isAdmin = session.user.role === "admin";

  const tab = sp.tab === "accepted" || sp.tab === "declined" ? sp.tab : "pending";

  const requests = await prisma.onlineRequest.findMany({
    where: { status: tab },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      customer: { select: { fullName: true } },
      pool: { select: { name: true, address: true } },
      visit: { select: { id: true, scheduledAt: true } },
      acceptedBy: { select: { name: true } },
    },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader title="Онлайн-заявки" subtitle="Заявки клиентов на сервис" />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <div className="mt-6 flex gap-2 border-b border-zinc-200 pb-2">
          {(["pending", "accepted", "declined"] as const).map((t) => (
            <Link
              key={t}
              href={`/service/online-requests?tab=${t}`}
              className={
                tab === t
                  ? "rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium"
                  : "rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              }
            >
              {t === "pending" ? "Новые" : t === "accepted" ? "Принятые" : "Отклонённые"}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {requests.length === 0 && (
            <Card><p className="text-sm text-zinc-500">Пока нет заявок.</p></Card>
          )}
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-base font-semibold">
                    {r.customer.fullName} — {r.pool.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatMoscowDate(r.createdAt)}
                  </div>
                </div>
                {r.pool.address && (
                  <div className="text-xs text-zinc-500">{r.pool.address}</div>
                )}
                <div className="text-sm">
                  Желаемый период: {formatMoscowDate(r.desiredFrom)} — {formatMoscowDate(r.desiredTo)}
                </div>
                {r.message && (
                  <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">{r.message}</div>
                )}
                {r.status === "accepted" && r.visit && (
                  <div className="text-sm text-emerald-700">
                    Принята · визит {formatMoscowDate(r.visit.scheduledAt)} ·{" "}
                    {r.acceptedBy?.name ?? "—"} ·{" "}
                    <Link href={`/service/visits/${r.visit.id}`} className="underline">
                      открыть визит
                    </Link>
                  </div>
                )}
                {r.status === "declined" && (
                  <div className="text-sm text-red-700">
                    Отклонена · {r.acceptedBy?.name ?? "—"}
                    {r.declineReason && <>: {r.declineReason}</>}
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/service/online-requests/${r.id}/accept`}>
                      <Button>Принять</Button>
                    </Link>
                    {isAdmin && (
                      <form action={declineOnlineRequestAction}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Причина отклонения"
                          className="mr-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                        />
                        <Button type="submit" variant="destructive">Отклонить</Button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Создать страницу приёмки `src/app/service/online-requests/[id]/accept/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import { acceptOnlineRequestAction } from "@/lib/server-actions/online-requests";
import { checkVisitConflicts } from "@/lib/server-actions/visits";

type Params = Promise<{ id: string }>;

export default async function AcceptRequestPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const req = await prisma.onlineRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, fullName: true } },
      pool: { select: { id: true, name: true } },
    },
  });
  if (!req || req.status !== "pending") notFound();

  const serviceUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Предзаполняем slot = desiredFrom 10:00 (Europe/Moscow)
  const m = new Date(req.desiredFrom);
  // Сдвигаем к 10:00 по UTC+3 — это 07:00 UTC того же дня
  const scheduledAt = new Date(
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate(), 7, 0, 0),
  );

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title="Приём заявки"
          subtitle={`${req.customer.fullName} — ${req.pool.name}`}
        />
        <div className="mt-6">
          <VisitForm
            mode={{
              kind: "accept",
              requestId: req.id,
              acceptAction: acceptOnlineRequestAction,
              lockedCustomer: { id: req.customer.id, fullName: req.customer.fullName },
              lockedPool: { id: req.pool.id, name: req.pool.name },
              checkConflicts: checkAction,
            }}
            customers={[]}
            serviceUsers={serviceUsers}
            defaults={{
              customerId: req.customer.id,
              poolId: req.pool.id,
              serviceUserId: session.user.id,
              scheduledAt,
              durationMinutes: 60,
            }}
          />
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 3:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Ручная проверка отложена до Task 14 (когда у нас будет клиентская форма и можно будет отправить заявку).

- [ ] **Step 5:** Commit

```bash
git add src/app/service/online-requests/
git commit -m "этап 7: /service/online-requests + страница приёмки"
```

---

## Task 13: Главная сервисника — добавить карточки и виджет ближайших визитов

**Files:**
- Modify: `src/app/service/page.tsx`
- Create: `src/components/service/UpcomingVisitsWidget.tsx`

- [ ] **Step 1:** Создать виджет `src/components/service/UpcomingVisitsWidget.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/Page";
import { formatMoscow } from "@/lib/calendar/dates";

export async function UpcomingVisitsWidget() {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const visits = await prisma.visit.findMany({
    where: {
      status: "planned",
      scheduledAt: { gte: now, lte: in7d },
    },
    orderBy: { scheduledAt: "asc" },
    take: 3,
    include: {
      pool: { select: { name: true, customer: { select: { fullName: true } } } },
      serviceUser: { select: { name: true } },
    },
  });

  if (visits.length === 0) return null;

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-zinc-900">Ближайшие визиты</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {visits.map((v) => (
          <li key={v.id}>
            <Link
              href={`/service/visits/${v.id}`}
              className="flex flex-wrap items-baseline gap-2 rounded-md px-2 py-1 text-sm hover:bg-zinc-50"
            >
              <span className="font-medium">{formatMoscow(v.scheduledAt)}</span>
              <span className="text-zinc-700">
                {v.pool.customer.fullName} — {v.pool.name}
              </span>
              <span className="text-xs text-zinc-500">{v.serviceUser.name ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2:** Обновить `src/app/service/page.tsx` — добавить две новые карточки в `SECTIONS` и виджет ближайших визитов. Также убрать заглушку «Календарь, визиты и заявки появятся в следующих этапах».

Заменить весь файл на:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { UpcomingEquipmentWidget } from "@/components/service/UpcomingEquipmentWidget";
import { UpcomingVisitsWidget } from "@/components/service/UpcomingVisitsWidget";
import { prisma } from "@/lib/prisma";

const SECTIONS: { href: string; title: string; description: string; icon: React.ReactNode }[] = [
  {
    href: "/service/customers",
    title: "Клиенты и бассейны",
    description: "Карточки клиентов, бассейны, фото, инструкции, карта объектов.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M2 22a8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5 8 8 0 0 0 4 0 8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5" />
        <path d="M2 17a8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5 8 8 0 0 0 4 0 8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5" />
        <path d="M7 14V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v9" />
      </svg>
    ),
  },
  {
    href: "/service/calendar",
    title: "Календарь",
    description: "Все визиты сервисников в одном месте. Создание визита и серий.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/service/online-requests",
    title: "Онлайн-заявки",
    description: "Заявки клиентов на сервис.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export default async function ServiceHome() {
  const session = await auth();
  const pendingRequests = await prisma.onlineRequest.count({ where: { status: "pending" } });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Привет, ${session?.user.name ?? ""}`}
          subtitle="Кабинет сервисника"
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  {s.icon}
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-zinc-900">{s.title}</div>
                    {s.href === "/service/online-requests" && pendingRequests > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {pendingRequests}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
                </div>
                <div className="mt-3 text-sm font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
                  Открыть →
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <UpcomingEquipmentWidget scope="service" />
        <UpcomingVisitsWidget />
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 3:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Ручная проверка:
  - Открыть `/service` → видны 3 карточки: «Клиенты и бассейны», «Календарь», «Онлайн-заявки»
  - Если есть `planned` визит в ближайшие 7 дней — внизу появился виджет «Ближайшие визиты»

- [ ] **Step 5:** Commit

```bash
git add src/components/service/UpcomingVisitsWidget.tsx src/app/service/page.tsx
git commit -m "этап 7: главная сервисника — карточки календаря/заявок + виджет визитов"
```

---

## Task 14: Форма заявки клиента `/client/request-visit`

**Files:**
- Create: `src/app/client/request-visit/page.tsx`

- [ ] **Step 1:** Создать страницу:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert, FormField } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { hasUnpaidDebt } from "@/lib/payments/debt";
import { createOnlineRequestAction } from "@/lib/server-actions/online-requests";

type SP = Promise<{ ok?: string; error?: string }>;

export default async function RequestVisitPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    include: { pools: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
  if (!customer) redirect("/");

  const debt = await hasUnpaidDebt(customer.id);

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title="Заявка на визит"
          subtitle="Оставьте желаемый период — сервисник свяжется и назначит время"
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        {customer.pools.length === 0 && (
          <div className="mt-6">
            <Alert variant="info">
              У вас пока нет ни одного бассейна, обратитесь к администратору.
            </Alert>
          </div>
        )}

        {customer.pools.length > 0 && debt && (
          <div className="mt-6">
            <Alert variant="error">
              Оплатите предыдущий визит, прежде чем отправлять новую заявку.
            </Alert>
          </div>
        )}

        {customer.pools.length > 0 && !debt && (
          <Card className="mt-6">
            <form action={createOnlineRequestAction} className="flex flex-col gap-4">
              {customer.pools.length > 1 ? (
                <FormField label="Бассейн" htmlFor="poolId">
                  <select
                    id="poolId"
                    name="poolId"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    required
                  >
                    {customer.pools.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <input type="hidden" name="poolId" value={customer.pools[0].id} />
              )}

              <FormField label="Желаемая дата с" htmlFor="desiredFrom">
                <Input id="desiredFrom" name="desiredFrom" type="date" required />
              </FormField>
              <FormField label="Желаемая дата по" htmlFor="desiredTo">
                <Input id="desiredTo" name="desiredTo" type="date" required />
              </FormField>
              <FormField label="Сообщение (опционально)" htmlFor="message">
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  placeholder="Что нужно проверить?"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </FormField>
              <div className="flex justify-end">
                <Button type="submit">Отправить заявку</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <Link href="/client" className="text-sm text-teal-700 underline">
            ← на главную
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/app/client/request-visit/page.tsx
git commit -m "этап 7: /client/request-visit — форма заявки клиента"
```

---

## Task 15: Список заявок клиента `/client/requests`

**Files:**
- Create: `src/app/client/requests/page.tsx`

- [ ] **Step 1:** Создать страницу:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscowDate, formatMoscow } from "@/lib/calendar/dates";

type SP = Promise<{ ok?: string; error?: string }>;

export default async function ClientRequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!customer) redirect("/");

  const requests = await prisma.onlineRequest.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      pool: { select: { name: true } },
      visit: { select: { id: true, scheduledAt: true } },
    },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Мои заявки"
          subtitle="История ваших обращений в сервис"
          actions={
            <Link href="/client/request-visit">
              <Button>+ Новая заявка</Button>
            </Link>
          }
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <div className="mt-6 flex flex-col gap-3">
          {requests.length === 0 && (
            <Card><p className="text-sm text-zinc-500">Заявок пока нет.</p></Card>
          )}
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-base font-semibold">{r.pool.name}</div>
                  <div className="text-xs text-zinc-500">{formatMoscowDate(r.createdAt)}</div>
                </div>
                <div className="text-sm text-zinc-700">
                  Желаемый период: {formatMoscowDate(r.desiredFrom)} — {formatMoscowDate(r.desiredTo)}
                </div>
                {r.message && (
                  <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{r.message}</div>
                )}
                {r.status === "pending" && (
                  <div className="text-sm text-amber-700">Статус: ожидает ответа</div>
                )}
                {r.status === "accepted" && r.visit && (
                  <div className="text-sm text-emerald-700">
                    Принято · визит {formatMoscow(r.visit.scheduledAt)} ·{" "}
                    <Link href={`/client/visits/${r.visit.id}`} className="underline">
                      детали
                    </Link>
                  </div>
                )}
                {r.status === "declined" && (
                  <div className="text-sm text-red-700">
                    Отклонено{r.declineReason ? `: ${r.declineReason}` : ""}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/app/client/requests/page.tsx
git commit -m "этап 7: /client/requests — список заявок клиента"
```

---

## Task 16: Карточка визита для клиента `/client/visits/[id]`

Нужна минимальная страница, чтобы из `/client/requests` ссылка «детали» вела куда-то осмысленное. Полная функциональность визита (PDF, чек-лист, фото) — этап 8.

**Files:**
- Create: `src/app/client/visits/[id]/page.tsx`

- [ ] **Step 1:** Создать страницу:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscow } from "@/lib/calendar/dates";

type Params = Promise<{ id: string }>;

export default async function ClientVisitPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!customer) redirect("/");

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: { select: { name: true, customerId: true } },
      serviceUser: { select: { name: true } },
    },
  });
  if (!visit || visit.pool.customerId !== customer.id) notFound();

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title="Запланированный визит"
          subtitle={visit.pool.name}
        />
        <Card className="mt-6">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500">Дата и время</dt>
            <dd>{formatMoscow(visit.scheduledAt)}</dd>
            <dt className="text-zinc-500">Длительность</dt>
            <dd>{visit.durationMinutes} мин</dd>
            <dt className="text-zinc-500">Сервисник</dt>
            <dd>{visit.serviceUser.name ?? "—"}</dd>
            <dt className="text-zinc-500">Статус</dt>
            <dd>{visit.status === "planned" ? "запланирован" : visit.status}</dd>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Отчёт по визиту появится после его завершения.
          </p>
        </Card>
        <div className="mt-6">
          <Link href="/client/requests">
            <Button variant="secondary">← К заявкам</Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors. Если ошибка про `variant="secondary"` — заменить на доступный вариант (например, без `variant` или `outline`).

- [ ] **Step 3:** Commit

```bash
git add src/app/client/visits/[id]/page.tsx
git commit -m "этап 7: /client/visits/[id] — минимальная карточка визита для клиента"
```

---

## Task 17: Главная клиента — карточки заявок

**Files:**
- Modify: `src/app/client/page.tsx`

- [ ] **Step 1:** Заменить содержимое `src/app/client/page.tsx` на:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

const SECTIONS: { href: string; title: string; description: string }[] = [
  {
    href: "/client/request-visit",
    title: "Заявка на визит",
    description: "Отправьте заявку — сервисник свяжется и назначит время.",
  },
  {
    href: "/client/requests",
    title: "Мои заявки",
    description: "История ваших обращений и статусы.",
  },
];

export default async function ClientHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Здравствуйте, ${session?.user.name ?? ""}`}
          subtitle="Личный кабинет клиента «Хорошие Бассейны»"
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="text-base font-semibold text-zinc-900">{s.title}</div>
                <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
                <div className="mt-3 text-sm font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
                  Открыть →
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/app/client/page.tsx
git commit -m "этап 7: главная клиента — карточки заявки/истории"
```

---

## Task 18: End-to-end ручная проверка чек-пойнта

**Files:**
- Modify: `plan.md` (в корне проекта) — обновить чек-лист этапа 7 на финальный, отметить галочки

- [ ] **Step 1:** Запустить `npm run dev` и пройти полный сценарий чек-пойнта:

  1. Логин как клиент (созданный в этапе 3 + бассейн в этапе 4) → попадаем на `/client`
  2. Карточка «Заявка на визит» → форма
  3. Выбрать бассейн (если ≥2), указать желаемые даты (например, 12 мая — 15 мая 2026), сообщение «Проверьте, пожалуйста, фильтр» → submit
  4. Редирект на `/client/requests?ok=Заявка%20отправлена` → видна заявка со статусом «ожидает ответа»
  5. Логаут, логин как сервисник (этап 3) → `/service`
  6. Карточка «Онлайн-заявки» с красным бэйджем «1»
  7. Открыть `/service/online-requests` → таб «Новые», видна карточка заявки
  8. Кнопка «Принять» → форма приёмки с предзаполненной датой `12 мая 10:00 MSK`, длительностью 60 мин, бассейн и клиент из заявки заблокированы
  9. Изменить дату на 13 мая 2026 14:00, длительность 90, submit → редирект на `/service/visits/<id>?ok=Заявка%20принята`
  10. Открыть `/service/calendar` → виден созданный визит на 13 мая 2026 14:00-15:30
  11. Логаут, логин обратно как клиент → `/client/requests` → статус заявки «Принято · визит 13.05.2026 14:00 · детали»
  12. Кликнуть «детали» → попадаем на `/client/visits/<id>` с карточкой визита
  13. Проверить терминал dev-сервера — должны быть строки `[push-stub] new_online_request → user ...` (после step 4) и `[push-stub] request_accepted → user ...` (после step 9)
  14. Проверить `ActivityLog` через psql или `/admin/activity-log` (если уже есть): должны быть `online_request.create`, `online_request.accept`, `visit.create`, `push.queued.new_online_request`, `push.queued.request_accepted`

- [ ] **Step 2:** Дополнительный сценарий — серия и конфликты:

  1. Логин как сервисник, открыть `/service/calendar/new`
  2. Создать визит на 14 мая 2026 14:00 60 мин — проверить что в календаре появился
  3. Снова `+ Визит` → выбрать того же сервисника, 14 мая 2026 14:30 60 мин → форма показывает warning «У сервисника уже есть визит» и кнопка превращается в «Всё равно создать» → подтверждаем → второй визит создаётся
  4. `+ Визит` → отметить «Серия повторов», period weekly, 4 повтора, начало 20 мая 2026 → submit → 4 визита одного цвета на 20, 27 мая, 3, 10 июня
  5. Открыть один из визитов серии → `/service/visits/<id>` → видно поле «Серия: weekly, 4 повторов»

- [ ] **Step 3:** Краевой кейс — месячная серия от 31 числа.

  1. Создать серию 31 января 2027 12:00 monthly × 4 → визиты 31 янв, 28 фев, 31 марта, 30 апр (либо подобный для текущего года, главное чтобы переход 31→28/29 работал корректно).

- [ ] **Step 4:** Финальные проверки качества кода.

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: type-check 0 errors; lint — без новых ошибок (existing pre-existing ошибка в `AddressAutocomplete.tsx` из этапа 4 допустима); `next build` успешно.

- [ ] **Step 5:** Обновить `plan.md` (корневой):

Заменить блок «## Этап 7. Календарь и онлайн-запись» (строки 119-130) на:

```markdown
## Этап 7. Календарь и онлайн-запись

- [x] Prisma: VisitStatus/VisitKind/OnlineRequestStatus enum'ы; модели Visit/VisitSeries/OnlineRequest; миграция `calendar_init`
- [x] `lib/server-actions/visits.ts` — create/update/cancel/checkVisitConflicts/getVisitsInRange
- [x] `lib/server-actions/visit-series.ts` — createVisitSeries/cancelSeries (weekly/biweekly/monthly через `addMonths`/`addDays`)
- [x] `lib/server-actions/online-requests.ts` — createOnlineRequest/acceptOnlineRequest/declineOnlineRequest
- [x] `lib/payments/debt.ts` — заглушка `hasUnpaidDebt` (полная реализация — этап 13)
- [x] `lib/push/stub.ts` — `enqueuePush` через ActivityLog + console.log (реальный пуш — этап 12)
- [x] `lib/calendar/dates.ts` — `generateOccurrenceDates`, `formatMoscow*`, `parseMoscowLocalDateTime`
- [x] `/service/calendar` + `<CalendarView />` через FullCalendar (locale ru, timezone Europe/Moscow, firstDay=1, dynamic ssr:false)
- [x] `<VisitForm />` — общая форма create/edit/accept с конфликт-warning и опциональной серией
- [x] `/service/calendar/new`, `/service/visits/[id]`, `/service/online-requests`, `/service/online-requests/[id]/accept`
- [x] `/client/request-visit`, `/client/requests`, `/client/visits/[id]`
- [x] Главная сервисника: карточки «Календарь», «Онлайн-заявки» (с бэйджем) + виджет ближайших визитов
- [x] Главная клиента: карточки «Заявка», «Мои заявки»
- [x] ActivityLog: visit.create/update/cancel, visit.series.create/cancel, online_request.create/accept/decline, push.queued.*
- [x] Type-check, lint, `next build` чистые

**Чекпойнт:** Клиент через ЛК отправляет заявку → сервисник видит её в `/service/online-requests` → принимает → видит созданный визит в календаре → клиент видит в ЛК статус «принято».
```

И в самом конце файла (после строки «**Текущий статус:**»):

```markdown
**Текущий статус:** этап 7 готов к приёмке (2026-05-08). Этапы 8-17 — pending.
```

- [ ] **Step 6:** Финальный коммит этапа.

```bash
git add plan.md
git commit -m "этап 7: чек-лист готов, ждёт приёмки юзером"
```

После этого переход в чек-пойнт-диалог: «Этап 7 готов. Открой `/client` под клиентом → отправь заявку, перелогинься сервисником → прими заявку, проверь календарь и список заявок клиента. Подтверди — пометим этап как принятый».

---

## Self-Review

**1. Spec coverage** — прошёлся по разделам спеки:

- §3 (Schema) — Task 1 ✓
- §4.1 visits.ts — Task 5 ✓
- §4.2 visit-series.ts — Task 6 ✓
- §4.3 online-requests.ts — Task 7 ✓
- §4.4 debt.ts / push/stub.ts / calendar/timezone.ts — Task 4, 3, 2 ✓
- §4.5 ActivityLog actions — встроены в server actions Task 5/6/7 ✓
- §5.1 /service/calendar — Task 9 ✓
- §5.2 <VisitForm /> — Task 8 ✓ (используется в Task 10, 11, 12)
- §5.3 /client/request-visit — Task 14 ✓
- §5.4 /client/requests — Task 15 ✓
- §5.5 /service/online-requests — Task 12 ✓
- §5.6 главная сервисника — Task 13 ✓
- §5.7 главная клиента — Task 17 ✓
- §5.8 защита роутов — proxy.ts уже покрывает /service/* и /client/* по префиксу, отдельная задача не нужна
- §6 миграции и зависимости — Task 0, 1 ✓
- §7 чек-лист этапа — Task 18 step 5 ✓
- §8 ручное тестирование — Task 18 step 1-3 ✓

Дополнительно: `/client/visits/[id]` (Task 16) — нужна для рабочей ссылки из `/client/requests`.

**2. Placeholder scan** — все шаги содержат конкретный код или конкретные команды; «TBD»/«TODO»/«как в Task N» отсутствуют.

**3. Type consistency** — проверил соответствие имён и сигнатур:
- `enqueuePush(kind, recipients, payload)` — Task 3 определяет, Task 5/6/7 используют ✓
- `generateOccurrenceDates(startAt, recurrence, occurrences)` — Task 2 определяет, Task 6 использует ✓
- `checkVisitConflicts({ serviceUserId, scheduledAt, durationMinutes, excludeVisitId? })` — Task 5 определяет, Task 10/11/12 оборачивают в server-action wrapper ✓
- `getVisitsInRange(from, to, filter?)` — Task 5 определяет, Task 9 использует ✓
- `<VisitForm />` mode union — Task 8 определяет, Task 10/11/12 передают ✓
- Поля Prisma-моделей — `Visit.scheduledAt`, `Visit.durationMinutes`, `OnlineRequest.desiredFrom/desiredTo`, `VisitSeries.startAt/recurrence/occurrences` — везде совпадают со схемой Task 1 ✓
