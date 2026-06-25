# Подтверждение клиентом назначенного времени — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиент подаёт заявку «нужен сервис» без выбора времени; сервисник назначает время; клиент затем подтверждает (создаётся визит) или отклоняет (заявка закрывается).

**Architecture:** Расширяем `OnlineRequestStatus` статусом `proposed`. Предложенное сервисником время хранится прямо в `OnlineRequest` (`proposed*`-поля) — `Visit` не создаётся до подтверждения клиентом. Подтверждение создаёт `Visit` с мягкой проверкой занятости слота. Отклонение клиентом — финал.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 (adapter-pg), PostgreSQL 17, Zod, web-push (существующий `enqueuePush`).

## Global Constraints

- В проекте **нет тестового харнесса** (ни раннера, ни тестов). Верификация каждой задачи = `npx tsc --noEmit` (типчек) + где указано `npm run build`, плюс ручная проверка потока на dev-сервере (`npm run dev`, порт задан через `$env:PORT`).
- Dev-сервер для этого проекта поднимается на порту **3010** (на 3000 висит другой CRM). Запуск: `$env:PORT="3010"; npm run dev`.
- Все UTF-8 файлы с кириллицей править **только** Edit-инструментом (не PowerShell Get-Content/Set-Content — ломает кодировку).
- БД: `postgresql://postgres:Test1234@localhost:5432/good_pools_crm_db` (Postgres 16, порт 5432).
- Прод-БД не трогать; миграции только локально.
- Push — через существующий `enqueuePush(kind, recipients, payload)`; новые `PushKind` добавлять в union и в `buildPayload`.
- Коммитить после каждой задачи.

---

### Task 1: Схема — статус `proposed`, nullable желаемые даты, `proposed*`-поля

**Files:**
- Modify: `prisma/schema.prisma` (enum `OnlineRequestStatus`, model `OnlineRequest`, model `User`)
- Migration: `prisma/migrations/<timestamp>_client_confirm_appointment/` (генерируется CLI)

**Interfaces:**
- Produces: enum value `OnlineRequestStatus.proposed`; поля `OnlineRequest.proposedServiceUserId: String?`, `proposedAt: DateTime?`, `proposedDurationMinutes: Int?`, `proposedNotes: String?`, relation `proposedServiceUser`; `OnlineRequest.desiredFrom`/`desiredTo` становятся `DateTime?`; relation `User.proposedRequests`.

- [ ] **Step 1: Добавить значение `proposed` в enum**

В `prisma/schema.prisma` найти:

```prisma
enum OnlineRequestStatus {
  pending
  accepted
  declined
}
```

Заменить на:

```prisma
enum OnlineRequestStatus {
  pending
  proposed
  accepted
  declined
}
```

- [ ] **Step 2: Сделать желаемые даты nullable и добавить `proposed*`-поля**

В модели `OnlineRequest` найти строки:

```prisma
  desiredFrom   DateTime
  desiredTo     DateTime
```

Заменить на:

```prisma
  desiredFrom   DateTime?
  desiredTo     DateTime?
```

Затем в той же модели, рядом с `acceptedById String?`, добавить:

```prisma
  proposedServiceUserId   String?
  proposedAt              DateTime?
  proposedDurationMinutes Int?
  proposedNotes           String?
```

И в блоке relations модели `OnlineRequest` (где уже есть `acceptedBy User? @relation("OnlineRequestAcceptedBy", ...)`) добавить:

```prisma
  proposedServiceUser User? @relation("OnlineRequestProposedBy", fields: [proposedServiceUserId], references: [id])
```

- [ ] **Step 3: Добавить обратную relation в модель `User`**

В модели `User` найти существующую обратную relation для принятых заявок (строка вида `acceptedRequests OnlineRequest[] @relation("OnlineRequestAcceptedBy")`) и рядом добавить:

```prisma
  proposedRequests OnlineRequest[] @relation("OnlineRequestProposedBy")
```

> Если точного имени обратного поля нет — добавить обе обратные relations так, чтобы имена `@relation` совпадали с прямыми (`OnlineRequestAcceptedBy`, `OnlineRequestProposedBy`).

- [ ] **Step 4: Создать миграцию**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx prisma migrate dev --name client_confirm_appointment
```
Expected: миграция создана и применена, `Your database is now in sync with your schema`. Prisma Client перегенерирован.

- [ ] **Step 5: Проверить типчек**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit
```
Expected: новые поля/enum доступны в типах Prisma. Существующий код, использующий `req.desiredFrom`/`desiredTo` как non-null, теперь может дать ошибки `possibly null` — это нормально, их чиним в Task 2/6/7. Если ошибок нет — отлично; если есть, они только в этих местах.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add prisma/schema.prisma prisma/migrations && git commit -m "feat(schema): статус proposed + proposed-поля заявки, nullable желаемые даты"
```

---

### Task 2: Клиентская форма заявки — убрать выбор дат

**Files:**
- Modify: `src/app/client/request-visit/page.tsx` (удалить поля дат)
- Modify: `src/lib/server-actions/online-requests.ts:46-133` (`CreateRequestSchema`, `createOnlineRequestAction`)

**Interfaces:**
- Consumes: `OnlineRequest.desiredFrom?/desiredTo?` nullable (Task 1).
- Produces: `createOnlineRequestAction(formData)` создаёт заявку без дат (`desiredFrom`/`desiredTo` не передаются → null).

- [ ] **Step 1: Упростить `CreateRequestSchema`**

В `src/lib/server-actions/online-requests.ts` заменить весь блок `CreateRequestSchema` (строки ~46-70) на:

```ts
const CreateRequestSchema = z.object({
  poolId: z.string().min(1, "Бассейн обязателен"),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});
```

- [ ] **Step 2: Убрать даты из `createOnlineRequestAction`**

В `createOnlineRequestAction` заменить формирование `data` (строки ~74-79) на:

```ts
  const data = {
    poolId: String(formData.get("poolId") ?? ""),
    message: String(formData.get("message") ?? ""),
  };
```

В вызове `prisma.onlineRequest.create` убрать строки `desiredFrom` и `desiredTo`, оставив:

```ts
  const req = await prisma.onlineRequest.create({
    data: {
      customerId: customer.id,
      poolId: parsed.data.poolId,
      message: parsed.data.message || null,
      status: "pending",
    },
  });
```

В `logActivity` после создания заменить `diff` на (убрать ссылки на `req.desiredFrom/desiredTo`):

```ts
    diff: {
      poolId: req.poolId,
    },
```

- [ ] **Step 3: Удалить поля дат из клиентской формы**

В `src/app/client/request-visit/page.tsx` удалить весь блок с двумя `FormField` для дат (строки ~119-140, обёртка `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2"> ... </div>` с `desiredFrom` и `desiredTo`).

Также удалить ставшую ненужной функцию-хелпер `isoDateOffset` (строки ~14-22) и неиспользуемый импорт `Input` из строки 7, если он больше нигде в файле не используется (проверить: после удаления дат `Input` не используется — убрать из импорта).

- [ ] **Step 4: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS. Форма заявки больше не содержит полей дат; `createOnlineRequestAction` компилируется без обращения к `desiredFrom/desiredTo`.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add src/app/client/request-visit/page.tsx src/lib/server-actions/online-requests.ts && git commit -m "feat(client): заявка без выбора времени, только бассейн и комментарий"
```

---

### Task 3: Сервисник назначает время (`proposeTimeAction`) + переименование страницы

**Files:**
- Modify: `src/lib/server-actions/online-requests.ts:135-241` (переименовать `acceptOnlineRequestAction` → `proposeTimeAction`, без создания `Visit`)
- Modify: `src/lib/push/enqueue.ts` (новый `PushKind` `time_proposed`)
- Modify: `src/components/calendar/VisitForm.tsx` (переименовать поле режима `acceptAction` → `proposeAction`, текст кнопки)
- Modify: `src/app/service/online-requests/[id]/accept/page.tsx` (заголовок, prefill при null-дате, имя экшена)

**Interfaces:**
- Consumes: `proposed*`-поля (Task 1).
- Produces: `proposeTimeAction(formData)` — пишет `proposed*`-поля, ставит `status="proposed"`, **Visit не создаёт**, шлёт push `time_proposed` клиенту; redirect `/service/online-requests?tab=proposed`. PushKind `time_proposed`. VisitForm mode `{ kind: "accept"; proposeAction: ... }`.

- [ ] **Step 1: Добавить PushKind `time_proposed`**

В `src/lib/push/enqueue.ts` в union `PushKind` добавить `| "time_proposed"`. В `buildPayload` добавить кейс (рядом с `request_accepted`):

```ts
    case "time_proposed":
      return {
        title: "Вам назначено время",
        body: `Сервис ${str(raw.dateLabel, "назначен")} — подтвердите`,
        url: `/client/requests`,
        tag: `req-${str(raw.requestId)}`,
      };
```

- [ ] **Step 2: Переписать экшен в `proposeTimeAction` (без `Visit`)**

В `src/lib/server-actions/online-requests.ts` переименовать `AcceptSchema` → `ProposeSchema` (содержимое не меняется) и заменить функцию `acceptOnlineRequestAction` целиком на:

```ts
export async function proposeTimeAction(formData: FormData) {
  const actor = await requireServicer();
  const data = {
    requestId: String(formData.get("requestId") ?? ""),
    serviceUserId: String(formData.get("serviceUserId") ?? ""),
    scheduledAt: new Date(String(formData.get("scheduledAt") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = ProposeSchema.safeParse(data);
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

  const req = await prisma.onlineRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req) {
    redirect(`/service/online-requests?error=${encodeURIComponent("Заявка не найдена")}`);
  }
  if (req.status !== "pending") {
    redirect(`/service/online-requests?error=${encodeURIComponent("Заявка уже обработана")}`);
  }

  const updated = await prisma.onlineRequest.update({
    where: { id: req.id },
    data: {
      status: "proposed",
      acceptedById: actor.id,
      proposedServiceUserId: parsed.data.serviceUserId,
      proposedAt: parsed.data.scheduledAt,
      proposedDurationMinutes: parsed.data.durationMinutes,
      proposedNotes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "online_request.propose_time",
    entityType: "OnlineRequest",
    entityId: updated.id,
    diff: {
      proposedAt: updated.proposedAt?.toISOString() ?? null,
      proposedServiceUserId: updated.proposedServiceUserId,
    },
  });

  const clientUserId = await getCustomerUserId(updated.customerId);
  if (clientUserId) {
    const dateLabel = new Date(parsed.data.scheduledAt).toLocaleString("ru-RU", {
      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
    await enqueuePush("time_proposed", [{ userId: clientUserId }], {
      requestId: updated.id,
      dateLabel,
    });
  }

  revalidatePath("/service/online-requests");
  revalidatePath("/client/requests");
  redirect(`/service/online-requests?tab=proposed&ok=${encodeURIComponent("Время назначено, ждём подтверждения клиента")}`);
}
```

- [ ] **Step 3: Переименовать поле режима в `VisitForm`**

В `src/components/calendar/VisitForm.tsx` в типе `VisitFormMode`, в варианте `kind: "accept"`, переименовать `acceptAction` → `proposeAction`:

```ts
  | { kind: "accept"; requestId: string; proposeAction: (fd: FormData) => void; lockedCustomer: { id: string; fullName: string }; lockedPool: { id: string; name: string }; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number }) => Promise<Conflict[]> };
```

В атрибуте `action={...}` формы (тернарник на строках ~113-119) последнюю ветку `: mode.acceptAction` заменить на `: mode.proposeAction`.

Текст кнопки submit (строка ~284): заменить `"Сохранить"` на `"Назначить время"` и `"Всё равно создать"` на `"Всё равно назначить"`:

```tsx
            {confirming ? "Всё равно назначить" : busy ? "Проверка…" : "Назначить время"}
```

- [ ] **Step 4: Обновить страницу приёма**

В `src/app/service/online-requests/[id]/accept/page.tsx`:

Импорт заменить `acceptOnlineRequestAction` → `proposeTimeAction`:

```ts
import { proposeTimeAction } from "@/lib/server-actions/online-requests";
```

Prefill `scheduledAt` (строки ~34-39) сделать устойчивым к null `desiredFrom`:

```ts
  // Предзаполняем slot: желаемой даты больше нет — берём завтра 10:00 (Europe/Moscow)
  const base = req.desiredFrom ? new Date(req.desiredFrom) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const scheduledAt = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 7, 0, 0),
  );
```

Заголовок `PageHeader` (строка ~67): `title="Приём заявки"` → `title="Назначение времени"`.

В пропсе `mode` заменить `acceptAction: acceptOnlineRequestAction` на `proposeAction: proposeTimeAction`.

- [ ] **Step 5: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS. `acceptOnlineRequestAction` больше не существует; ссылок на него нет.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add src/lib/server-actions/online-requests.ts src/lib/push/enqueue.ts src/components/calendar/VisitForm.tsx "src/app/service/online-requests/[id]/accept/page.tsx" && git commit -m "feat(service): назначение времени без создания визита (статус proposed)"
```

---

### Task 4: Вынести неохраняемый помощник проверки занятости `findVisitConflicts`

**Files:**
- Create: `src/lib/calendar/conflicts.ts`
- Modify: `src/lib/server-actions/visits.ts:55-92` (`checkVisitConflicts` использует общий помощник)

**Interfaces:**
- Produces: `findVisitConflicts(input: { serviceUserId: string; scheduledAt: Date; durationMinutes: number; excludeVisitId?: string }): Promise<VisitConflict[]>` — БЕЗ проверки роли (чтобы вызывать из клиентского экшена). Тип `VisitConflict = { id: string; scheduledAt: Date; durationMinutes: number; customerName: string; poolName: string }`.
- Consumes: `prisma`.

- [ ] **Step 1: Создать `src/lib/calendar/conflicts.ts`**

```ts
import { prisma } from "@/lib/prisma";

export type VisitConflict = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  customerName: string;
  poolName: string;
};

// Пересечения визитов сервисника по времени. БЕЗ проверки роли —
// вызывается и из служебных экшенов, и из клиентского подтверждения.
export async function findVisitConflicts(input: {
  serviceUserId: string;
  scheduledAt: Date;
  durationMinutes: number;
  excludeVisitId?: string;
}): Promise<VisitConflict[]> {
  const start = input.scheduledAt;
  const end = new Date(start.getTime() + input.durationMinutes * 60 * 1000);
  const candidates = await prisma.visit.findMany({
    where: {
      serviceUserId: input.serviceUserId,
      status: { in: ["planned", "in_progress"] },
      id: input.excludeVisitId ? { not: input.excludeVisitId } : undefined,
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
```

- [ ] **Step 2: Переиспользовать помощник в `checkVisitConflicts`**

В `src/lib/server-actions/visits.ts`:

Добавить импорт вверху (после существующих импортов):

```ts
import { findVisitConflicts, type VisitConflict } from "@/lib/calendar/conflicts";
```

Удалить локальное определение `export type VisitConflict = {...}` (строки ~33-39) — теперь оно импортируется. Заменить тело `checkVisitConflicts` (всё после `await requireServicer();`) на делегирование:

```ts
export async function checkVisitConflicts(input: {
  serviceUserId: string;
  scheduledAt: Date;
  durationMinutes: number;
  excludeVisitId?: string;
}): Promise<VisitConflict[]> {
  await requireServicer();
  return findVisitConflicts(input);
}
```

> Если `VisitConflict` где-то импортируется из `@/lib/server-actions/visits` — реэкспорт сохраняется через `import ... type VisitConflict` + строку `export type { VisitConflict };` добавить, если потребуется компилятору. Проверить типчеком в Step 3.

- [ ] **Step 3: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS. Логика конфликтов не дублируется; `checkVisitConflicts` делегирует в `findVisitConflicts`.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add src/lib/calendar/conflicts.ts src/lib/server-actions/visits.ts && git commit -m "refactor(calendar): вынести findVisitConflicts (без guard) для переиспользования"
```

---

### Task 5: Клиентские экшены подтверждения и отклонения

**Files:**
- Modify: `src/lib/server-actions/online-requests.ts` (добавить `confirmOnlineRequestAction`, `rejectOnlineRequestAction`)
- Modify: `src/lib/push/enqueue.ts` (новые `PushKind` `request_confirmed`, `request_rejected`)

**Interfaces:**
- Consumes: `findVisitConflicts` (Task 4); `proposed*`-поля (Task 1); `requireClient()`, `enqueuePush`, `getCustomerUserId`.
- Produces: `confirmOnlineRequestAction(formData)` — создаёт `Visit` (`planned`, `kind="online_request"`), линкует `visitId`, `status="accepted"`, мягкая проверка занятости, push сервиснику. `rejectOnlineRequestAction(formData)` — `status="declined"`, пишет `declineReason`, push сервиснику. PushKind `request_confirmed`, `request_rejected`.

- [ ] **Step 1: Добавить PushKinds для уведомления сервисника**

В `src/lib/push/enqueue.ts` в union `PushKind` добавить `| "request_confirmed" | "request_rejected"`. В `buildPayload` добавить кейсы:

```ts
    case "request_confirmed":
      return {
        title: "Клиент подтвердил время",
        body: str(raw.warn) === "1"
          ? "⚠ Возможна накладка в расписании"
          : str(raw.summary, "Визит подтверждён"),
        url: str(raw.visitId) ? `/service/visits/${str(raw.visitId)}` : `/service/online-requests?tab=accepted`,
        tag: `req-${str(raw.requestId)}`,
      };
    case "request_rejected":
      return {
        title: "Клиент отклонил время",
        body: str(raw.reason, "Заявка отклонена клиентом"),
        url: `/service/online-requests?tab=declined`,
        tag: `req-${str(raw.requestId)}`,
      };
```

- [ ] **Step 2: Добавить импорт `findVisitConflicts`**

В `src/lib/server-actions/online-requests.ts` добавить в импорты:

```ts
import { findVisitConflicts } from "@/lib/calendar/conflicts";
```

- [ ] **Step 3: Добавить `confirmOnlineRequestAction`**

В конец `src/lib/server-actions/online-requests.ts` добавить:

```ts
const ConfirmSchema = z.object({ requestId: z.string().min(1) });

export async function confirmOnlineRequestAction(formData: FormData) {
  const { customer } = await requireClient();
  const parsed = ConfirmSchema.safeParse({
    requestId: String(formData.get("requestId") ?? ""),
  });
  if (!parsed.success) {
    redirect(`/client/requests?error=${encodeURIComponent("Не указана заявка")}`);
  }

  const req = await prisma.onlineRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req || req.customerId !== customer.id) {
    redirect(`/client/requests?error=${encodeURIComponent("Заявка не найдена")}`);
  }
  if (req.status !== "proposed" || !req.proposedServiceUserId || !req.proposedAt) {
    redirect(`/client/requests?error=${encodeURIComponent("Заявка не ожидает подтверждения")}`);
  }

  const serviceUserId = req.proposedServiceUserId;
  const scheduledAt = req.proposedAt;
  const durationMinutes = req.proposedDurationMinutes ?? 60;

  // Мягкая проверка занятости — не блокирует, только предупреждает сервисника.
  const conflicts = await findVisitConflicts({ serviceUserId, scheduledAt, durationMinutes });

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.onlineRequest.findUnique({ where: { id: req.id } });
    if (!fresh || fresh.status !== "proposed") {
      throw new Error("Заявка уже обработана");
    }
    const visit = await tx.visit.create({
      data: {
        poolId: req.poolId,
        serviceUserId,
        scheduledAt,
        durationMinutes,
        status: "planned",
        kind: "online_request",
        notes: req.proposedNotes,
      },
    });
    const updated = await tx.onlineRequest.update({
      where: { id: req.id },
      data: { status: "accepted", visitId: visit.id },
    });
    return { visit, request: updated };
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : "Ошибка подтверждения";
    redirect(`/client/requests?error=${encodeURIComponent(msg)}`);
  });

  if (!result) return;

  await logActivity({
    actorId: customer.userId,
    action: "online_request.confirm",
    entityType: "OnlineRequest",
    entityId: result.request.id,
    diff: { visitId: result.visit.id, conflicts: conflicts.length },
  });

  if (req.proposedServiceUserId) {
    await enqueuePush("request_confirmed", [{ userId: req.proposedServiceUserId }], {
      requestId: result.request.id,
      visitId: result.visit.id,
      warn: conflicts.length > 0 ? "1" : "0",
    });
  }

  revalidatePath("/client/requests");
  revalidatePath("/service/online-requests");
  revalidatePath("/service/calendar");
  redirect(`/client/requests?ok=${encodeURIComponent("Время подтверждено, визит назначен")}`);
}
```

- [ ] **Step 4: Добавить `rejectOnlineRequestAction`**

Далее в том же файле добавить:

```ts
const RejectSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function rejectOnlineRequestAction(formData: FormData) {
  const { customer } = await requireClient();
  const parsed = RejectSchema.safeParse({
    requestId: String(formData.get("requestId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    redirect(`/client/requests?error=${encodeURIComponent("Не указана заявка")}`);
  }

  const req = await prisma.onlineRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req || req.customerId !== customer.id) {
    redirect(`/client/requests?error=${encodeURIComponent("Заявка не найдена")}`);
  }
  if (req.status !== "proposed") {
    redirect(`/client/requests?error=${encodeURIComponent("Заявка не ожидает подтверждения")}`);
  }

  const updated = await prisma.onlineRequest.update({
    where: { id: req.id },
    data: { status: "declined", declineReason: parsed.data.reason || null },
  });

  await logActivity({
    actorId: customer.userId,
    action: "online_request.reject",
    entityType: "OnlineRequest",
    entityId: updated.id,
    diff: { reason: parsed.data.reason || null },
  });

  if (req.proposedServiceUserId) {
    await enqueuePush("request_rejected", [{ userId: req.proposedServiceUserId }], {
      requestId: updated.id,
      reason: parsed.data.reason || null,
    });
  }

  revalidatePath("/client/requests");
  revalidatePath("/service/online-requests");
  redirect(`/client/requests?ok=${encodeURIComponent("Заявка отклонена")}`);
}
```

- [ ] **Step 5: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add src/lib/server-actions/online-requests.ts src/lib/push/enqueue.ts && git commit -m "feat(client): подтверждение/отклонение назначенного времени"
```

---

### Task 6: Клиентский UI — статус `proposed` + кнопки подтвердить/отклонить

**Files:**
- Modify: `src/app/client/requests/page.tsx`

**Interfaces:**
- Consumes: `confirmOnlineRequestAction`, `rejectOnlineRequestAction` (Task 5); `proposed*`-поля (Task 1).

- [ ] **Step 1: Импортировать клиентские экшены и Button уже есть**

В `src/app/client/requests/page.tsx` добавить импорт:

```ts
import { confirmOnlineRequestAction, rejectOnlineRequestAction } from "@/lib/server-actions/online-requests";
```

- [ ] **Step 2: Добавить `proposed` в статусные словари**

Заменить `STATUS_LABEL` и `STATUS_STYLE` (строки ~12-22) на:

```ts
const STATUS_LABEL: Record<"pending" | "proposed" | "accepted" | "declined", string> = {
  pending: "В обработке",
  proposed: "Назначено время",
  accepted: "Принята",
  declined: "Отклонена",
};

const STATUS_STYLE: Record<"pending" | "proposed" | "accepted" | "declined", string> = {
  pending: "bg-amber-50 text-amber-900 ring-amber-200",
  proposed: "bg-sky-50 text-sky-900 ring-sky-200",
  accepted: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  declined: "bg-red-50 text-red-900 ring-red-200",
};
```

- [ ] **Step 3: Подтянуть `proposed*` и `proposedServiceUser` в запрос**

В `prisma.onlineRequest.findMany` (строки ~49-64) в `include` добавить `proposedServiceUser`:

```ts
    include: {
      pool: { select: { name: true, address: true } },
      proposedServiceUser: { select: { name: true } },
      visit: {
        select: {
          id: true,
          scheduledAt: true,
          notes: true,
          serviceUser: { select: { name: true } },
        },
      },
    },
```

- [ ] **Step 4: Заменить рендер карточки заявки**

В `.map((r) => {...})` заменить строку приведения типа и блок «Желаемый период» + статусные блоки.

Строку `const status = r.status as "pending" | "accepted" | "declined";` заменить на:

```tsx
            const status = r.status as "pending" | "proposed" | "accepted" | "declined";
```

Удалить блок «Желаемый период» (строки ~120-123):

```tsx
                  <div className="text-sm">
                    Желаемый период: {formatMoscowDate(r.desiredFrom)} —{" "}
                    {formatMoscowDate(r.desiredTo)}
                  </div>
```

Вместо него (после блока с `r.message`) добавить блок для статуса `proposed` с кнопками:

```tsx
                  {status === "proposed" && r.proposedAt && (
                    <div className="flex flex-col gap-2 rounded-md bg-sky-50 px-3 py-3 ring-1 ring-sky-200">
                      <div className="text-sm text-sky-900">
                        Сервисник предлагает время:{" "}
                        <strong>{formatMoscow(r.proposedAt)}</strong>
                        {r.proposedServiceUser?.name ? ` (${r.proposedServiceUser.name})` : ""}.
                      </div>
                      {r.proposedNotes && (
                        <div className="whitespace-pre-wrap rounded-md bg-white/60 px-3 py-2 text-sm text-sky-900">
                          {r.proposedNotes}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <form action={confirmOnlineRequestAction}>
                          <input type="hidden" name="requestId" value={r.id} />
                          <Button type="submit">Подтвердить</Button>
                        </form>
                        <form action={rejectOnlineRequestAction} className="flex items-center gap-2">
                          <input type="hidden" name="requestId" value={r.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Причина (необязательно)"
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                          />
                          <Button type="submit" variant="destructive">Отклонить</Button>
                        </form>
                      </div>
                    </div>
                  )}
```

> `formatMoscow` уже импортирован (строка 8). `formatMoscowDate` после удаления блока «Желаемый период» может стать неиспользуемым — если так, убрать его из импорта на строке 8, оставив `formatMoscow`.

- [ ] **Step 5: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add src/app/client/requests/page.tsx && git commit -m "feat(client-ui): блок подтверждения/отклонения назначенного времени"
```

---

### Task 7: Сервисный список — вкладка «Ожидают клиента» + защита от null-дат

**Files:**
- Modify: `src/app/service/online-requests/page.tsx`

**Interfaces:**
- Consumes: статус `proposed`, `proposed*`-поля (Task 1).

- [ ] **Step 1: Добавить `proposed` в выбор вкладки и тип запроса**

В `src/app/service/online-requests/page.tsx` заменить строку выбора вкладки (строка ~21):

```ts
  const tab =
    sp.tab === "accepted" || sp.tab === "declined" || sp.tab === "proposed"
      ? sp.tab
      : "pending";
```

В `prisma.onlineRequest.findMany` заменить `where` и расширить `include`:

```ts
    where: { status: tab as "pending" | "proposed" | "accepted" | "declined" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      customer: { select: { fullName: true } },
      pool: { select: { name: true, address: true } },
      visit: { select: { id: true, scheduledAt: true } },
      acceptedBy: { select: { name: true } },
      proposedServiceUser: { select: { name: true } },
    },
```

- [ ] **Step 2: Добавить вкладку «Ожидают клиента»**

Заменить блок вкладок (строки ~44-58) на:

```tsx
        <div className="mt-6 flex gap-2 border-b border-zinc-200 pb-2">
          {(["pending", "proposed", "accepted", "declined"] as const).map((t) => (
            <Link
              key={t}
              href={`/service/online-requests?tab=${t}`}
              className={
                tab === t
                  ? "rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium"
                  : "rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              }
            >
              {t === "pending"
                ? "Новые"
                : t === "proposed"
                  ? "Ожидают клиента"
                  : t === "accepted"
                    ? "Принятые"
                    : "Отклонённые"}
            </Link>
          ))}
        </div>
```

- [ ] **Step 3: Убрать вывод «Желаемый период» (даты теперь null)**

Удалить блок (строки ~78-80):

```tsx
                <div className="text-sm">
                  Желаемый период: {formatMoscowDate(r.desiredFrom)} — {formatMoscowDate(r.desiredTo)}
                </div>
```

- [ ] **Step 4: Показать предложенное время для статуса `proposed`**

После блока с `r.message` (перед блоком `r.status === "accepted"`) добавить:

```tsx
                {r.status === "proposed" && (
                  <div className="text-sm text-sky-700">
                    Предложено клиенту: {r.proposedAt ? formatMoscowDate(r.proposedAt) : "—"} ·{" "}
                    {r.proposedServiceUser?.name ?? r.acceptedBy?.name ?? "—"} · ждём ответа
                  </div>
                )}
```

- [ ] **Step 5: Переименовать кнопку «Принять» → «Назначить время»**

В блоке `r.status === "pending"` (строки ~99-103) заменить:

```tsx
                    <Link href={`/service/online-requests/${r.id}/accept`}>
                      <Button>Назначить время</Button>
                    </Link>
```

> `formatMoscowDate` остаётся используемым (Step 4 и `r.createdAt`/`r.visit.scheduledAt`) — импорт не трогать.

- [ ] **Step 6: Типчек и сборка**

Run:
```bash
cd /c/Users/Roman/good-pools-crm && npx tsc --noEmit && npm run build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Roman/good-pools-crm && git add "src/app/service/online-requests/page.tsx" && git commit -m "feat(service-ui): вкладка Ожидают клиента, назначение времени вместо приёма"
```

---

### Task 8: Ручная проверка сквозного потока

**Files:** —

- [ ] **Step 1: Поднять dev-сервер**

Run (PowerShell, в фоне):
```powershell
$env:PORT="3010"; npm run dev
```
Открыть `http://localhost:3010`.

- [ ] **Step 2: Клиент создаёт заявку**

Войти клиентом → «Запись на сервис». Убедиться: **полей дат нет**, только бассейн + комментарий. Отправить. Заявка появляется в «Мои заявки» со статусом «В обработке».

- [ ] **Step 3: Сервисник назначает время**

Войти как `service`/`admin` → «Онлайн-заявки» → вкладка «Новые» → у заявки кнопка **«Назначить время»**. Открыть, задать сервисника/дату/время/длительность → **«Назначить время»**. Заявка уходит во вкладку **«Ожидают клиента»**. Визита в календаре пока **нет**.

- [ ] **Step 4: Клиент подтверждает**

Войти клиентом → «Мои заявки»: статус «Назначено время», показано предложенное время + кнопки. Нажать **«Подтвердить»**. Статус → «Принята», создан визит. Проверить, что визит появился в `/service/calendar` и `/service/visits/...`.

- [ ] **Step 5: Проверить отклонение (отдельная заявка)**

Повторить шаги 2-3 для новой заявки, затем клиентом нажать **«Отклонить»** с причиной. Статус → «Отклонена», причина видна и клиенту, и сервиснику (вкладка «Отклонённые»). Визит **не создан**.

- [ ] **Step 6: Проверить мягкую накладку (опционально)**

Назначить двум разным заявкам одно и то же время одного сервисника, подтвердить обе. Обе подтверждаются (жёсткой блокировки нет); во втором подтверждении сервиснику уходит push с пометкой «⚠ Возможна накладка».

---

## Self-Review

**Spec coverage:**
- «Клиент подаёт заявку без выбора времени» → Task 1 (nullable даты) + Task 2 (форма). ✓
- Новый статус `proposed` → Task 1. ✓
- «Сервисник назначает время, Visit не создаётся» → Task 3. ✓
- «Клиент подтверждает (создаётся Visit) / отклоняет (финал)» → Task 5 + Task 6. ✓
- «Мягкая проверка занятости при подтверждении» → Task 4 (`findVisitConflicts`) + Task 5. ✓
- «Отклонение = финал, новая заявка с нуля» → Task 5 (`status=declined`, без визита). ✓
- Вкладка «Ожидают клиента» у сервисника → Task 7. ✓
- Уведомления (предложение → клиент; подтверждение/отказ → сервисник) → Task 3 (`time_proposed`), Task 5 (`request_confirmed`, `request_rejected`). ✓
- Вне зоны (нет переназначения, таймаута, отдельного поля «кто отклонил», жёсткой блокировки) — соблюдено. ✓

**Placeholder scan:** плейсхолдеров нет; весь код приведён целиком.

**Type consistency:** `proposeTimeAction`, `confirmOnlineRequestAction`, `rejectOnlineRequestAction`, `findVisitConflicts`, `VisitConflict`, `time_proposed`/`request_confirmed`/`request_rejected`, поле режима `proposeAction` — имена согласованы между задачами. Статусный union `"pending" | "proposed" | "accepted" | "declined"` одинаков в Task 6 и Task 7.
