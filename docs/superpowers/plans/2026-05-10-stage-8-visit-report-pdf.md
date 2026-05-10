# Этап 8 — Визит, отчёт, PDF. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервисник на телефоне открывает запланированный визит, нажимает «Начать», заполняет чек-лист (autosave), фото с камеры, доп.работы, химию, ставит сумму и завершает. По завершении — генерация PDF, клиент в `/client/visits/[id]` видит HTML-копию + кнопку «Скачать PDF». Админ всегда, сервисник 24ч могут переоткрыть визит для правок (PDF перегенерируется).

**Architecture:** 5 новых Prisma-моделей (`VisitChecklistAnswer`, `VisitPhoto`, `VisitExtraWork`, `ChemistryItem`, `VisitChemistry`) + новые поля на `Visit`. Серверные actions — единый файл `src/lib/server-actions/visit-report.ts`. Один client-component на каждую секцию страницы визита. PDF — `@react-pdf/renderer` server-side, кириллица через bundled-шрифт Inter. Фото визита — `sharp` resize до 2000px. Сумма — вводится вручную. HTML-копия = ре-используемый `VisitReadOnlyView`.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres, TypeScript strict, Tailwind 4, zod, Auth.js v5; новые: `@react-pdf/renderer`, `sharp`, shadcn `command` + `popover` (для Combobox).

**Связанная спека:** `docs/superpowers/specs/2026-05-10-stage-8-visit-report-pdf-design.md`

**Project conventions to follow strictly:**
- Server actions: `"use server"`, проверка роли (`requireStaff()`), валидация через `z.safeParse`, `redirect` с `?ok=` / `?error=` для form-actions, JSON-возврат `{ ok: true } | { ok: false; error }` для autosave-actions, `revalidatePath`, `logActivity`, `enqueuePush`.
- Pages: server-components, `<Header />`, `<PageContainer><PageHeader>`, UI из `src/components/Page.tsx`.
- Client-components только там, где нужны interactivity/refs (autosave, drag-drop, combobox, sticky-bar).
- Все даты в БД — UTC `DateTime`. На UI — `formatMoscow()`.
- `prisma.$transaction(...)` для многошаговых операций.
- Все Decimal-поля — `@db.Decimal(10, 2)` (qty химии — `@db.Decimal(10, 3)`).

---

## Task 0: Установить новые зависимости

**Files:**
- Modify: `package.json` (auto via npm)
- Modify: `package-lock.json` (auto)

- [ ] **Step 1:** Установить рантайм-пакеты

```bash
npm install @react-pdf/renderer sharp
```

- [ ] **Step 2:** Проверить, что в `package.json` появились строки в `dependencies` (версии могут отличаться):

```json
"@react-pdf/renderer": "^4.x.x",
"sharp": "^0.34.x"
```

- [ ] **Step 3:** Установить shadcn компоненты `command` + `popover` (нужны для Combobox в задаче 4)

```bash
npx shadcn@latest add command popover
```

При интерактивном выборе: оставить дефолты. Проверить, что появились файлы `src/components/ui/command.tsx` и `src/components/ui/popover.tsx`.

- [ ] **Step 4:** Type-check проходит

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Build проходит

```bash
npm run build
```

Expected: `next build` без ошибок.

- [ ] **Step 6:** Commit

```bash
git add package.json package-lock.json src/components/ui/command.tsx src/components/ui/popover.tsx
git commit -m "этап 8: deps — react-pdf, sharp, shadcn command/popover"
```

---

## Task 1: Prisma — новые поля Visit + 5 моделей + миграция

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_visit_report_init/migration.sql` (auto)

- [ ] **Step 1:** В `prisma/schema.prisma` найти модель `Visit` и добавить новые поля **между** `notes` и `createdAt`:

```prisma
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
  startedAt       DateTime?
  completedAt    DateTime?
  totalAmount     Decimal?    @db.Decimal(10, 2)
  pdfPath         String?
  pdfGeneratedAt  DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  // ... оставить relations как есть

  // Добавить новые relations:
  checklistAnswers VisitChecklistAnswer[]
  photos           VisitPhoto[]
  extraWorks       VisitExtraWork[]
  chemistry        VisitChemistry[]
}
```

- [ ] **Step 2:** Добавить 5 новых моделей в конец файла (после `OnlineRequest`):

```prisma
model VisitChecklistAnswer {
  id         String   @id @default(cuid())
  visitId    String
  questionId String
  value      Json
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  visit    Visit             @relation(fields: [visitId], references: [id], onDelete: Cascade)
  question ChecklistQuestion @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([visitId, questionId])
  @@index([visitId])
}

model VisitPhoto {
  id           String   @id @default(cuid())
  visitId      String
  path         String
  originalName String?
  size         Int?
  width        Int?
  height       Int?
  uploadedAt   DateTime @default(now())

  visit Visit @relation(fields: [visitId], references: [id], onDelete: Cascade)

  @@index([visitId])
}

model VisitExtraWork {
  id        String   @id @default(cuid())
  visitId   String
  name      String
  price     Decimal  @db.Decimal(10, 2)
  order     Int      @default(0)
  createdAt DateTime @default(now())

  visit Visit @relation(fields: [visitId], references: [id], onDelete: Cascade)

  @@index([visitId])
}

model ChemistryItem {
  id        String   @id @default(cuid())
  name      String
  unit      String
  price     Decimal  @db.Decimal(10, 2)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  usages VisitChemistry[]

  @@index([active])
}

model VisitChemistry {
  id              String   @id @default(cuid())
  visitId         String
  chemistryItemId String?
  nameAtMoment    String
  unitAtMoment    String
  priceAtMoment   Decimal  @db.Decimal(10, 2)
  qty             Decimal  @db.Decimal(10, 3)
  order           Int      @default(0)
  createdAt       DateTime @default(now())

  visit         Visit          @relation(fields: [visitId], references: [id], onDelete: Cascade)
  chemistryItem ChemistryItem? @relation(fields: [chemistryItemId], references: [id], onDelete: SetNull)

  @@index([visitId])
  @@index([chemistryItemId])
}
```

- [ ] **Step 3:** Также найти `model ChecklistQuestion` и добавить обратную relation (под полями, перед `@@index`):

```prisma
  answers VisitChecklistAnswer[]
```

- [ ] **Step 4:** Применить миграцию

```bash
npx prisma migrate dev --name visit_report_init
```

Expected: миграция создаётся, БД обновляется без ошибок. Файл появляется в `prisma/migrations/<timestamp>_visit_report_init/`.

- [ ] **Step 5:** Type-check + сгенерированный клиент актуален

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Commit

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "этап 8: schema — поля Visit + 5 моделей (checklist answers, photos, extra works, chemistry)"
```

---

## Task 2: Сидер ChemistryItem + npm-скрипт

**Files:**
- Create: `prisma/seeds/chemistry.ts`
- Modify: `package.json` (новый script)

- [ ] **Step 1:** Создать `prisma/seeds/chemistry.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

const ITEMS = [
  { name: "Хлор гранулированный", unit: "кг", price: 800 },
  { name: "Альгицид", unit: "л", price: 600 },
  { name: "pH-минус", unit: "кг", price: 400 },
  { name: "pH-плюс", unit: "кг", price: 400 },
  { name: "Коагулянт", unit: "л", price: 700 },
];

async function main() {
  for (const item of ITEMS) {
    const existing = await prisma.chemistryItem.findFirst({
      where: { name: item.name },
    });
    if (existing) {
      console.log(`= ${item.name} уже существует, пропускаем`);
      continue;
    }
    await prisma.chemistryItem.create({
      data: { name: item.name, unit: item.unit, price: item.price, active: true },
    });
    console.log(`+ ${item.name} (${item.unit}, ${item.price} ₽)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2:** В `package.json` → `scripts` добавить строку (после `db:seed:checklist`):

```json
"db:seed:chemistry": "tsx prisma/seeds/chemistry.ts"
```

- [ ] **Step 3:** Запустить сидер

```bash
npm run db:seed:chemistry
```

Expected: `+ Хлор гранулированный (кг, 800 ₽)` и т.д. — 5 строк. Повторный запуск выводит `= ... уже существует`.

- [ ] **Step 4:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit

```bash
git add prisma/seeds/chemistry.ts package.json
git commit -m "этап 8: сидер ChemistryItem + npm-скрипт"
```

---

## Task 3: Расширить push-стаб + /api/files

**Files:**
- Modify: `src/lib/push/stub.ts`
- Modify: `src/app/api/files/[...path]/route.ts`

- [ ] **Step 1:** В `src/lib/push/stub.ts` расширить `PushKind`:

```ts
export type PushKind =
  | "new_online_request"
  | "request_accepted"
  | "request_declined"
  | "visit_assigned"
  | "visit_report_ready"
  | "visit_report_updated";
```

- [ ] **Step 2:** В `src/app/api/files/[...path]/route.ts` — расширить блок проверки прав. Найти блок `if (area === "pool-photos" || area === "pool-instructions") { ... } else { ... }` и заменить на:

```ts
  if (area === "pool-photos" || area === "pool-instructions") {
    const poolId = rest[0];
    if (!poolId) return new NextResponse("Bad request", { status: 400 });

    if (role === "client") {
      const pool = await prisma.pool.findUnique({
        where: { id: poolId },
        select: { customer: { select: { userId: true } } },
      });
      if (!pool || pool.customer.userId !== session.user.id) return unauthorized();
    } else if (role !== "admin" && role !== "service") {
      return unauthorized();
    }
  } else if (area === "visit-photos" || area === "reports-pdf") {
    const visitId = rest[0];
    if (!visitId) return new NextResponse("Bad request", { status: 400 });

    if (role === "client") {
      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        select: { pool: { select: { customer: { select: { userId: true } } } } },
      });
      if (!visit || visit.pool.customer.userId !== session.user.id) return unauthorized();
    } else if (role !== "admin" && role !== "service") {
      return unauthorized();
    }
  } else {
    // Unknown area — staff only by default
    if (role !== "admin" && role !== "service") return unauthorized();
  }
```

- [ ] **Step 3:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add src/lib/push/stub.ts src/app/api/files/[...path]/route.ts
git commit -m "этап 8: push-стаб расширен + /api/files доступы для visit-photos и reports-pdf"
```

---

## Task 4: Combobox UI + ChecklistValue + validation lib

**Files:**
- Create: `src/components/ui/combobox.tsx`
- Create: `src/lib/visit/checklist-value.ts`
- Create: `src/lib/visit/validation.ts`

- [ ] **Step 1:** Создать `src/components/ui/combobox.tsx` (поверх shadcn Command + Popover):

```tsx
"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboboxOption = { value: string; label: string; sub?: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Выбрать...",
  emptyText = "Не найдено",
  disabled = false,
  className,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-11 w-full justify-between text-base font-normal", className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Поиск..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{o.label}</span>
                    {o.sub && <span className="text-xs text-zinc-500">{o.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2:** Создать `src/lib/visit/checklist-value.ts`:

```ts
import type { ChecklistQuestionType } from "@prisma/client";

// Wrapper { v: ... } для всех типов — упрощает миграции типов в будущем
export type ChecklistValueRaw =
  | { v: string }
  | { v: string[] }
  | { v: boolean }
  | { v: null };

export type ChecklistAnswerInput =
  | { type: "text"; value: string }
  | { type: "number"; value: string } // храним как строку (запятая → точка делается рендером)
  | { type: "single_select"; value: string }
  | { type: "multi_select"; value: string[] }
  | { type: "bool"; value: boolean };

export function encodeChecklistValue(input: ChecklistAnswerInput): ChecklistValueRaw {
  return { v: input.value as never };
}

export function decodeChecklistValue(
  type: ChecklistQuestionType,
  raw: unknown,
): string | string[] | boolean | null {
  if (!raw || typeof raw !== "object" || !("v" in raw)) return null;
  const v = (raw as { v: unknown }).v;
  switch (type) {
    case "text":
    case "number":
    case "single_select":
      return typeof v === "string" ? v : null;
    case "multi_select":
      return Array.isArray(v) ? (v as string[]) : null;
    case "bool":
      return typeof v === "boolean" ? v : null;
    default:
      return null;
  }
}

export function isAnswerEmpty(
  type: ChecklistQuestionType,
  decoded: string | string[] | boolean | null,
): boolean {
  if (decoded === null) return true;
  switch (type) {
    case "text":
    case "number":
    case "single_select":
      return typeof decoded === "string" && decoded.trim() === "";
    case "multi_select":
      return Array.isArray(decoded) && decoded.length === 0;
    case "bool":
      return typeof decoded !== "boolean";
  }
}
```

- [ ] **Step 3:** Создать `src/lib/visit/validation.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { decodeChecklistValue, isAnswerEmpty } from "./checklist-value";

export type CompletionCheck = {
  ok: boolean;
  missingRequired: { questionId: string; label: string }[];
  photoCount: number;
  totalAmountSet: boolean;
  errors: string[];
};

export async function checkVisitCanComplete(visitId: string): Promise<CompletionCheck> {
  const [questions, answers, photoCount, visit] = await Promise.all([
    prisma.checklistQuestion.findMany({
      where: { active: true, required: true },
      select: { id: true, type: true, label: true },
    }),
    prisma.visitChecklistAnswer.findMany({
      where: { visitId },
      select: { questionId: true, value: true },
    }),
    prisma.visitPhoto.count({ where: { visitId } }),
    prisma.visit.findUnique({
      where: { id: visitId },
      select: { totalAmount: true },
    }),
  ]);

  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  const missingRequired: { questionId: string; label: string }[] = [];

  for (const q of questions) {
    const raw = answerMap.get(q.id);
    if (raw === undefined) {
      missingRequired.push({ questionId: q.id, label: q.label });
      continue;
    }
    const decoded = decodeChecklistValue(q.type, raw);
    if (isAnswerEmpty(q.type, decoded)) {
      missingRequired.push({ questionId: q.id, label: q.label });
    }
  }

  const totalAmountSet = visit?.totalAmount != null;

  const errors: string[] = [];
  if (missingRequired.length > 0) {
    errors.push(`Не заполнены обязательные вопросы (${missingRequired.length})`);
  }
  if (photoCount === 0) {
    errors.push("Нужно прикрепить минимум 1 фото");
  }
  if (!totalAmountSet) {
    errors.push("Не указана сумма к оплате");
  }

  return {
    ok: errors.length === 0,
    missingRequired,
    photoCount,
    totalAmountSet,
    errors,
  };
}
```

- [ ] **Step 4:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit

```bash
git add src/components/ui/combobox.tsx src/lib/visit/
git commit -m "этап 8: Combobox UI + checklist-value helpers + validation lib"
```

---

## Task 5: Server actions — visit lifecycle (start, reopen, saveTotal)

**Files:**
- Create: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** Создать `src/lib/server-actions/visit-report.ts` со скелетом и первыми actions:

```ts
"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import type { ChecklistQuestionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush, getCustomerUserId } from "@/lib/push/stub";
import { checkVisitCanComplete } from "@/lib/visit/validation";
import { encodeChecklistValue, type ChecklistAnswerInput } from "@/lib/visit/checklist-value";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const VISIT_PHOTOS_DIR = path.join(UPLOAD_ROOT, "visit-photos");
const REPORTS_PDF_DIR = path.join(UPLOAD_ROOT, "reports-pdf");

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 2000;
const SERVICE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireStaff() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

async function loadVisitOrThrow(visitId: string) {
  const visit = await prisma.visit.findUnique({ where: { id: visitId } });
  if (!visit) throw new Error("Визит не найден");
  return visit;
}

// =========================
// 1. Старт визита
// =========================
export async function startVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "planned") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не в статусе planned")}`);
  }
  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "in_progress", startedAt: new Date() },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.started",
    entityType: "Visit",
    entityId: visitId,
  });
  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит начат")}`);
}

// =========================
// 2. Сумма к оплате (autosave)
// =========================
const TotalSchema = z.object({
  visitId: z.string().min(1),
  amount: z.number().min(0).max(10_000_000),
});

export async function saveTotalAmountAction(input: {
  visitId: string;
  amount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = TotalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверная сумма" };
  }
  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
    select: { id: true, status: true },
  });
  if (!visit) return { ok: false, error: "Визит не найден" };
  if (visit.status !== "in_progress") {
    return { ok: false, error: "Сумму можно менять только во время выполнения визита" };
  }
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { totalAmount: input.amount },
  });
  return { ok: true };
}

// =========================
// 3. Переоткрыть завершённый визит
// =========================
export async function reopenVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "completed") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не завершён")}`);
  }

  const isAdmin = actor.role === "admin";
  if (!isAdmin) {
    if (visit.serviceUserId !== actor.id) {
      redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Можно править только свой визит")}`);
    }
    if (
      !visit.completedAt ||
      Date.now() - visit.completedAt.getTime() > SERVICE_EDIT_WINDOW_MS
    ) {
      redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Окно редактирования (24ч) истекло")}`);
    }
  }

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "in_progress", completedAt: null },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.reopened",
    entityType: "Visit",
    entityId: visitId,
  });
  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит переоткрыт")}`);
}
```

(Оставшиеся actions — checklist autosave, photos, extra works, chemistry, completeVisit — добавляются в задачах 6-9 и 16.)

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors. Если sharp ругается на отсутствующие типы — это нормально для CommonJS-пакета, типы идут вместе с пакетом.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server actions — start/reopen/saveTotal"
```

---

## Task 6: Server actions — checklist autosave

**Files:**
- Modify: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** В `src/lib/server-actions/visit-report.ts` добавить (в конец файла):

```ts
// =========================
// 4. Сохранение ответа чек-листа (autosave per field)
// =========================
const ChecklistAnswerSchema = z.object({
  visitId: z.string().min(1),
  questionId: z.string().min(1),
  type: z.enum(["text", "number", "single_select", "multi_select", "bool"]),
  // value валидируется ниже по type-discriminator
  value: z.unknown(),
});

export async function saveChecklistAnswerAction(input: {
  visitId: string;
  questionId: string;
  type: ChecklistQuestionType;
  value: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = ChecklistAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверный ввод" };
  }

  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
    select: { id: true, status: true },
  });
  if (!visit) return { ok: false, error: "Визит не найден" };
  if (visit.status !== "in_progress") {
    return { ok: false, error: "Чек-лист редактируется только во время выполнения" };
  }

  // Нормализация по типу
  let answer: ChecklistAnswerInput;
  switch (input.type) {
    case "text":
      answer = { type: "text", value: typeof input.value === "string" ? input.value : "" };
      break;
    case "number":
      answer = { type: "number", value: typeof input.value === "string" ? input.value : "" };
      break;
    case "single_select":
      answer = {
        type: "single_select",
        value: typeof input.value === "string" ? input.value : "",
      };
      break;
    case "multi_select":
      answer = {
        type: "multi_select",
        value: Array.isArray(input.value) ? (input.value as string[]) : [],
      };
      break;
    case "bool":
      answer = { type: "bool", value: input.value === true };
      break;
  }

  const encoded = encodeChecklistValue(answer);

  await prisma.visitChecklistAnswer.upsert({
    where: {
      visitId_questionId: {
        visitId: input.visitId,
        questionId: input.questionId,
      },
    },
    create: {
      visitId: input.visitId,
      questionId: input.questionId,
      value: encoded as never,
    },
    update: { value: encoded as never },
  });

  return { ok: true };
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server action — saveChecklistAnswer (autosave per field)"
```

---

## Task 7: Server actions — фото визита (upload + delete с sharp)

**Files:**
- Modify: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** Добавить в `src/lib/server-actions/visit-report.ts` (в конец):

```ts
// =========================
// 5. Загрузка/удаление фото визита
// =========================
function extOf(filename: string, mime: string) {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName) return fromName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic" || mime === "image/heif") return ".heic";
  return ".bin";
}

export async function uploadVisitPhotosAction(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const visitId = String(formData.get("visitId") ?? "");
  if (!visitId) {
    redirect(`/service/calendar?error=${encodeURIComponent("Не указан визит")}`);
  }
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { id: true, status: true },
  });
  if (!visit) {
    redirect(`/service/calendar?error=${encodeURIComponent("Визит не найден")}`);
  }
  if (visit.status !== "in_progress") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Фото можно добавлять только во время выполнения")}`);
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Нет файлов")}`);
  }

  const dir = path.join(VISIT_PHOTOS_DIR, visitId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  let saved = 0;
  let skipped = 0;
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      skipped++;
      continue;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      skipped++;
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let outBuffer = buffer;
    let outExt = ".jpg";
    let width: number | null = null;
    let height: number | null = null;

    try {
      const img = sharp(buffer).rotate(); // авто-ориентация по EXIF
      const meta = await img.metadata();
      const needsResize =
        (meta.width ?? 0) > PHOTO_MAX_DIMENSION ||
        (meta.height ?? 0) > PHOTO_MAX_DIMENSION;
      const resized = needsResize
        ? img.resize({
            width: PHOTO_MAX_DIMENSION,
            height: PHOTO_MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
        : img;
      outBuffer = await resized.jpeg({ quality: 85 }).toBuffer();
      const finalMeta = await sharp(outBuffer).metadata();
      width = finalMeta.width ?? null;
      height = finalMeta.height ?? null;
    } catch {
      // Если sharp не справился (HEIC без libvips и т.п.) — сохраняем оригинал
      outBuffer = buffer;
      outExt = extOf(file.name, file.type);
    }

    const filename = `${randomUUID()}${outExt}`;
    const filepath = path.join(dir, filename);
    await writeFile(filepath, outBuffer);

    await prisma.visitPhoto.create({
      data: {
        visitId,
        path: `visit-photos/${visitId}/${filename}`,
        originalName: file.name,
        size: outBuffer.length,
        width,
        height,
      },
    });
    saved++;
  }

  await logActivity({
    actorId: actor.id,
    action: "visit.photo.upload",
    entityType: "Visit",
    entityId: visitId,
    diff: { saved, skipped },
  });

  revalidatePath(`/service/visits/${visitId}`);

  const messages: string[] = [];
  if (saved) messages.push(`Загружено: ${saved}`);
  if (skipped) messages.push(`Пропущено: ${skipped}`);
  redirect(
    `/service/visits/${visitId}?${
      skipped > 0 && saved === 0 ? "error" : "ok"
    }=${encodeURIComponent(messages.join(". ") || "Готово")}`,
  );
}

export async function deleteVisitPhotoAction(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const visitId = String(formData.get("visitId") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  if (!visitId || !photoId) {
    redirect(`/service/calendar?error=${encodeURIComponent("Нет данных")}`);
  }

  const photo = await prisma.visitPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.visitId !== visitId) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Фото не найдено")}`);
  }

  const filepath = path.join(UPLOAD_ROOT, photo.path);
  try {
    if (existsSync(filepath)) await unlink(filepath);
  } catch {
    // ignore
  }

  await prisma.visitPhoto.delete({ where: { id: photoId } });

  await logActivity({
    actorId: actor.id,
    action: "visit.photo.delete",
    entityType: "Visit",
    entityId: visitId,
    diff: { photoId, path: photo.path },
  });

  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Фото удалено")}`);
}
```

- [ ] **Step 2:** Type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors. Если `sharp` ругается на missing optional dependencies во время build — переустановить с `npm rebuild sharp`.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server actions — фото визита (upload с sharp + delete)"
```

---

## Task 8: Server actions — доп.работы CRUD

**Files:**
- Modify: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** Добавить в `src/lib/server-actions/visit-report.ts` (в конец):

```ts
// =========================
// 6. Доп.работы (CRUD)
// =========================
const ExtraWorkSchema = z.object({
  visitId: z.string().min(1),
  name: z.string().trim().min(1, "Название обязательно").max(200),
  price: z.number().min(0).max(10_000_000),
});

async function ensureInProgress(visitId: string): Promise<void> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { status: true },
  });
  if (!visit) throw new Error("Визит не найден");
  if (visit.status !== "in_progress") {
    throw new Error("Редактирование возможно только во время выполнения");
  }
}

export async function addExtraWorkAction(input: {
  visitId: string;
  name: string;
  price: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const parsed = ExtraWorkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  try {
    await ensureInProgress(input.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }

  const last = await prisma.visitExtraWork.findFirst({
    where: { visitId: input.visitId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.visitExtraWork.create({
    data: {
      visitId: input.visitId,
      name: parsed.data.name,
      price: parsed.data.price,
      order: nextOrder,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.create",
    entityType: "Visit",
    entityId: input.visitId,
    diff: { id: created.id, name: created.name, price: created.price.toString() },
  });

  revalidatePath(`/service/visits/${input.visitId}`);
  return { ok: true, id: created.id };
}

export async function updateExtraWorkAction(input: {
  id: string;
  name: string;
  price: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!input.id) return { ok: false, error: "Нет id" };
  const existing = await prisma.visitExtraWork.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  const parsed = ExtraWorkSchema.safeParse({
    visitId: existing.visitId,
    name: input.name,
    price: input.price,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  await prisma.visitExtraWork.update({
    where: { id: input.id },
    data: { name: parsed.data.name, price: parsed.data.price },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.update",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: {
      id: input.id,
      before: { name: existing.name, price: existing.price.toString() },
      after: { name: parsed.data.name, price: parsed.data.price },
    },
  });
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

export async function deleteExtraWorkAction(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const existing = await prisma.visitExtraWork.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  await prisma.visitExtraWork.delete({ where: { id: input.id } });
  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.delete",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, name: existing.name, price: existing.price.toString() },
  });
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server actions — доп.работы CRUD"
```

---

## Task 9: Server actions — химия CRUD + список ChemistryItem

**Files:**
- Modify: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** Добавить в `src/lib/server-actions/visit-report.ts` (в конец):

```ts
// =========================
// 7. Химия — список доступных позиций (для Combobox)
// =========================
export async function listActiveChemistryItems() {
  await requireStaff();
  return prisma.chemistryItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, price: true },
  });
}

// =========================
// 8. Химия в визите (CRUD)
// =========================
const VisitChemistrySchema = z.object({
  visitId: z.string().min(1),
  chemistryItemId: z.string().min(1),
  qty: z.number().min(0.001).max(10_000),
});

export async function addVisitChemistryAction(input: {
  visitId: string;
  chemistryItemId: string;
  qty: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const parsed = VisitChemistrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  try {
    await ensureInProgress(input.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }

  const item = await prisma.chemistryItem.findUnique({
    where: { id: input.chemistryItemId },
  });
  if (!item || !item.active) {
    return { ok: false, error: "Позиция химии не найдена или неактивна" };
  }

  const last = await prisma.visitChemistry.findFirst({
    where: { visitId: input.visitId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.visitChemistry.create({
    data: {
      visitId: input.visitId,
      chemistryItemId: item.id,
      nameAtMoment: item.name,
      unitAtMoment: item.unit,
      priceAtMoment: item.price,
      qty: parsed.data.qty,
      order: nextOrder,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.add",
    entityType: "Visit",
    entityId: input.visitId,
    diff: {
      id: created.id,
      name: item.name,
      qty: parsed.data.qty,
      priceAtMoment: item.price.toString(),
    },
  });
  revalidatePath(`/service/visits/${input.visitId}`);
  return { ok: true, id: created.id };
}

export async function updateVisitChemistryQtyAction(input: {
  id: string;
  qty: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!input.id) return { ok: false, error: "Нет id" };
  const existing = await prisma.visitChemistry.findUnique({
    where: { id: input.id },
  });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  if (input.qty <= 0 || input.qty > 10_000) {
    return { ok: false, error: "Количество должно быть > 0 и ≤ 10000" };
  }
  await prisma.visitChemistry.update({
    where: { id: input.id },
    data: { qty: input.qty },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.update",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, before: existing.qty.toString(), after: input.qty },
  });
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

export async function deleteVisitChemistryAction(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const existing = await prisma.visitChemistry.findUnique({
    where: { id: input.id },
  });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  await prisma.visitChemistry.delete({ where: { id: input.id } });
  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.delete",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, name: existing.nameAtMoment, qty: existing.qty.toString() },
  });
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server actions — химия CRUD + listActiveChemistryItems"
```

---

## Task 10: UI — VisitChecklistSection (autosave per field)

**Files:**
- Create: `src/components/visit/VisitChecklistSection.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitChecklistSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { ChecklistQuestion, ChecklistQuestionType } from "@prisma/client";
import { ChecklistFieldRenderer } from "@/components/checklist/ChecklistFieldRenderer";
import { Card } from "@/components/Page";
import { saveChecklistAnswerAction } from "@/lib/server-actions/visit-report";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";

type AnswerMap = Record<string, unknown>;
type FieldState = "idle" | "saving" | "saved" | "error";

export function VisitChecklistSection({
  visitId,
  questions,
  initialAnswers,
  disabled = false,
  onProgressChange,
}: {
  visitId: string;
  questions: ChecklistQuestion[];
  initialAnswers: AnswerMap;
  disabled?: boolean;
  onProgressChange?: (filled: number, totalRequired: number) => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const requiredQuestions = questions.filter((q) => q.required && q.active);

  function reportProgress(map: AnswerMap) {
    if (!onProgressChange) return;
    const filled = requiredQuestions.filter((q) => {
      const decoded = decodeChecklistValue(q.type, map[q.id]);
      if (decoded === null) return false;
      if (typeof decoded === "string") return decoded.trim() !== "";
      if (Array.isArray(decoded)) return decoded.length > 0;
      if (typeof decoded === "boolean") return true;
      return false;
    }).length;
    onProgressChange(filled, requiredQuestions.length);
  }

  function handleChange(question: ChecklistQuestion, raw: string | string[] | boolean | null) {
    const next = { ...answers, [question.id]: { v: raw } };
    setAnswers(next);
    reportProgress(next);
    setFieldState((s) => ({ ...s, [question.id]: "saving" }));
    setErrors((e) => ({ ...e, [question.id]: "" }));

    startTransition(async () => {
      const result = await saveChecklistAnswerAction({
        visitId,
        questionId: question.id,
        type: question.type as ChecklistQuestionType,
        value: raw,
      });
      if (result.ok) {
        setFieldState((s) => ({ ...s, [question.id]: "saved" }));
        setTimeout(() => {
          setFieldState((s) => ({ ...s, [question.id]: "idle" }));
        }, 1500);
      } else {
        setFieldState((s) => ({ ...s, [question.id]: "error" }));
        setErrors((e) => ({ ...e, [question.id]: result.error }));
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">
        Чек-лист {requiredQuestions.length > 0 && `(обязательных: ${requiredQuestions.length})`}
      </h2>
      <div className="flex flex-col gap-5">
        {questions.map((q) => {
          const state = fieldState[q.id] ?? "idle";
          const decoded = decodeChecklistValue(q.type, answers[q.id]);
          return (
            <div key={q.id} className="relative">
              <ChecklistFieldRenderer
                question={q}
                value={decoded}
                onChange={(v) => handleChange(q, v)}
                disabled={disabled}
              />
              {state === "saving" && (
                <span className="absolute right-0 top-0 text-xs text-zinc-400">сохранение...</span>
              )}
              {state === "saved" && (
                <span className="absolute right-0 top-0 text-xs text-green-600">✓ сохранено</span>
              )}
              {state === "error" && errors[q.id] && (
                <span className="absolute right-0 top-0 text-xs text-red-600">{errors[q.id]}</span>
              )}
            </div>
          );
        })}
      </div>
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
git add src/components/visit/VisitChecklistSection.tsx
git commit -m "этап 8: UI — VisitChecklistSection с autosave per field"
```

---

## Task 11: UI — VisitPhotosSection (drag-drop + камера)

**Files:**
- Create: `src/components/visit/VisitPhotosSection.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitPhotosSection.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { uploadVisitPhotosAction, deleteVisitPhotoAction } from "@/lib/server-actions/visit-report";

type Photo = { id: string; path: string; originalName?: string | null; uploadedAt: Date };

export function VisitPhotosSection({
  visitId,
  photos,
  disabled = false,
}: {
  visitId: string;
  photos: Photo[];
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    setPending(true);
    const fd = new FormData();
    fd.append("visitId", visitId);
    for (const file of Array.from(e.target.files)) {
      fd.append("files", file);
    }
    try {
      await uploadVisitPhotosAction(fd);
    } finally {
      setPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Фото объекта ({photos.length})</h2>
      </div>

      {photos.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Нужно прикрепить минимум 1 фото для завершения визита.</p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            <img
              src={`/api/files/${p.path}`}
              alt={p.originalName ?? ""}
              className="h-full w-full object-cover"
            />
            {!disabled && (
              <form action={deleteVisitPhotoAction} className="absolute right-1 top-1">
                <input type="hidden" name="visitId" value={visitId} />
                <input type="hidden" name="photoId" value={p.id} />
                <button
                  type="submit"
                  className="rounded-full bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
                  aria-label="Удалить фото"
                >
                  ✕
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            // На мобиле iOS/Android — открывает камеру; на десктопе игнорируется
            // @ts-expect-error capture is valid HTML attribute, types lag
            capture="environment"
            onChange={onFileChange}
            disabled={pending}
            className="hidden"
            id={`photo-input-${visitId}`}
          />
          <label htmlFor={`photo-input-${visitId}`}>
            <Button type="button" disabled={pending} asChild>
              <span>{pending ? "Загрузка..." : "+ Добавить фото"}</span>
            </Button>
          </label>
        </div>
      )}
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
git add src/components/visit/VisitPhotosSection.tsx
git commit -m "этап 8: UI — VisitPhotosSection с камерой и drag-drop"
```

---

## Task 12: UI — VisitExtraWorksSection

**Files:**
- Create: `src/components/visit/VisitExtraWorksSection.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitExtraWorksSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addExtraWorkAction,
  updateExtraWorkAction,
  deleteExtraWorkAction,
} from "@/lib/server-actions/visit-report";

type Work = { id: string; name: string; price: string };

export function VisitExtraWorksSection({
  visitId,
  works,
  disabled = false,
}: {
  visitId: string;
  works: Work[];
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Work[]>(works);
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function addItem() {
    const price = Number(draft.price.replace(",", "."));
    if (!draft.name.trim() || isNaN(price) || price < 0) {
      setError("Введите название и цену");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addExtraWorkAction({
        visitId,
        name: draft.name.trim(),
        price,
      });
      if (result.ok) {
        setItems((arr) => [...arr, { id: result.id, name: draft.name.trim(), price: price.toString() }]);
        setDraft({ name: "", price: "" });
      } else {
        setError(result.error);
      }
    });
  }

  function updateRow(id: string, field: "name" | "price", value: string) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function commitRow(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const price = Number(item.price.replace(",", "."));
    if (!item.name.trim() || isNaN(price) || price < 0) {
      setError("Название и цена обязательны");
      return;
    }
    startTransition(async () => {
      const result = await updateExtraWorkAction({ id, name: item.name.trim(), price });
      if (!result.ok) setError(result.error);
      else setError(null);
    });
  }

  function deleteRow(id: string) {
    startTransition(async () => {
      const result = await deleteExtraWorkAction({ id });
      if (result.ok) {
        setItems((arr) => arr.filter((i) => i.id !== id));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Доп.работы</h2>

      {items.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Доп.работ нет.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="mb-2 flex gap-2">
          <Input
            value={item.name}
            onChange={(e) => updateRow(item.id, "name", e.target.value)}
            onBlur={() => commitRow(item.id)}
            disabled={disabled}
            placeholder="Название работы"
            className="h-11 flex-1"
          />
          <Input
            value={item.price}
            onChange={(e) => updateRow(item.id, "price", e.target.value.replace(",", "."))}
            onBlur={() => commitRow(item.id)}
            disabled={disabled}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-28"
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => deleteRow(item.id)}
              aria-label="Удалить"
              className="h-11 w-11 p-0"
            >
              ✕
            </Button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="mt-3 flex gap-2 border-t border-zinc-200 pt-3">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Название работы"
            className="h-11 flex-1"
          />
          <Input
            value={draft.price}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value.replace(",", ".") }))}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-28"
          />
          <Button type="button" onClick={addItem} className="h-11">
            +
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
git add src/components/visit/VisitExtraWorksSection.tsx
git commit -m "этап 8: UI — VisitExtraWorksSection"
```

---

## Task 13: UI — VisitChemistrySection

**Files:**
- Create: `src/components/visit/VisitChemistrySection.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitChemistrySection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  addVisitChemistryAction,
  updateVisitChemistryQtyAction,
  deleteVisitChemistryAction,
} from "@/lib/server-actions/visit-report";

type ChemRow = {
  id: string;
  nameAtMoment: string;
  unitAtMoment: string;
  priceAtMoment: string;
  qty: string;
};

type ChemItem = {
  id: string;
  name: string;
  unit: string;
  price: string;
};

export function VisitChemistrySection({
  visitId,
  rows,
  catalog,
  disabled = false,
}: {
  visitId: string;
  rows: ChemRow[];
  catalog: ChemItem[];
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ChemRow[]>(rows);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const options: ComboboxOption[] = catalog.map((c) => ({
    value: c.id,
    label: c.name,
    sub: `${c.unit} · ${Number(c.price).toLocaleString("ru-RU")} ₽`,
  }));

  function addRow() {
    if (!pickedId) {
      setError("Выберите позицию");
      return;
    }
    const qty = Number(draftQty.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      setError("Количество > 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addVisitChemistryAction({
        visitId,
        chemistryItemId: pickedId,
        qty,
      });
      if (result.ok) {
        const item = catalog.find((c) => c.id === pickedId);
        if (item) {
          setItems((arr) => [
            ...arr,
            {
              id: result.id,
              nameAtMoment: item.name,
              unitAtMoment: item.unit,
              priceAtMoment: item.price,
              qty: qty.toString(),
            },
          ]);
        }
        setPickedId(null);
        setDraftQty("");
      } else {
        setError(result.error);
      }
    });
  }

  function commitQty(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const qty = Number(item.qty.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      setError("Количество > 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateVisitChemistryQtyAction({ id, qty });
      if (!result.ok) setError(result.error);
    });
  }

  function deleteRow(id: string) {
    startTransition(async () => {
      const result = await deleteVisitChemistryAction({ id });
      if (result.ok) {
        setItems((arr) => arr.filter((i) => i.id !== id));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Химия</h2>

      {items.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Химия не использовалась.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="mb-2 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-sm font-medium">{item.nameAtMoment}</div>
            <div className="text-xs text-zinc-500">
              {Number(item.priceAtMoment).toLocaleString("ru-RU")} ₽ / {item.unitAtMoment}
            </div>
          </div>
          <Input
            value={item.qty}
            onChange={(e) =>
              setItems((arr) =>
                arr.map((i) =>
                  i.id === item.id ? { ...i, qty: e.target.value.replace(",", ".") } : i,
                ),
              )
            }
            onBlur={() => commitQty(item.id)}
            disabled={disabled}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-20"
          />
          <span className="text-sm text-zinc-500">{item.unitAtMoment}</span>
          {!disabled && (
            <Button type="button" variant="ghost" onClick={() => deleteRow(item.id)} className="h-11 w-11 p-0" aria-label="Удалить">
              ✕
            </Button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 sm:flex-row">
          <div className="flex-1">
            <Combobox
              options={options}
              value={pickedId}
              onChange={setPickedId}
              placeholder="Выбрать позицию"
              emptyText="Ничего не найдено"
            />
          </div>
          <Input
            value={draftQty}
            onChange={(e) => setDraftQty(e.target.value.replace(",", "."))}
            inputMode="decimal"
            placeholder="Кол-во"
            className="h-11 w-full sm:w-28"
          />
          <Button type="button" onClick={addRow} className="h-11">
            +
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
git add src/components/visit/VisitChemistrySection.tsx
git commit -m "этап 8: UI — VisitChemistrySection с Combobox"
```

---

## Task 14: UI — VisitTotalSection + VisitStickyBar

**Files:**
- Create: `src/components/visit/VisitTotalSection.tsx`
- Create: `src/components/visit/VisitStickyBar.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitTotalSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { saveTotalAmountAction } from "@/lib/server-actions/visit-report";

export function VisitTotalSection({
  visitId,
  initialAmount,
  hint,
  disabled = false,
  onAmountChange,
}: {
  visitId: string;
  initialAmount: string | null;
  hint: number;
  disabled?: boolean;
  onAmountChange?: (amount: number | null) => void;
}) {
  const [value, setValue] = useState(initialAmount ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commit() {
    if (value.trim() === "") {
      onAmountChange?.(null);
      return;
    }
    const amount = Number(value.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      setError("Введите число ≥ 0");
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    startTransition(async () => {
      const result = await saveTotalAmountAction({ visitId, amount });
      if (result.ok) {
        setState("saved");
        onAmountChange?.(amount);
        setTimeout(() => setState("idle"), 1500);
      } else {
        setState("error");
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Сумма к оплате</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Подсказка (доп.работы + химия): {hint.toLocaleString("ru-RU")} ₽. Можно оставить, изменить или вычесть скидку.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(",", "."))}
          onBlur={commit}
          disabled={disabled}
          inputMode="decimal"
          placeholder="0"
          className="h-12 flex-1 text-lg"
        />
        <span className="text-base text-zinc-600">₽</span>
      </div>
      {state === "saving" && <p className="mt-1 text-xs text-zinc-400">Сохранение...</p>}
      {state === "saved" && <p className="mt-1 text-xs text-green-600">✓ Сохранено</p>}
      {state === "error" && error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 2:** Создать `src/components/visit/VisitStickyBar.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function VisitStickyBar({
  checklistFilled,
  checklistTotal,
  photoCount,
  totalAmount,
  onComplete,
  pending = false,
}: {
  checklistFilled: number;
  checklistTotal: number;
  photoCount: number;
  totalAmount: number | null;
  onComplete: () => void;
  pending?: boolean;
}) {
  const checklistOk = checklistFilled >= checklistTotal;
  const photoOk = photoCount >= 1;
  const amountOk = totalAmount != null && totalAmount >= 0;
  const canComplete = checklistOk && photoOk && amountOk && !pending;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="text-xs text-zinc-600">
          <div>Чек-лист: <span className={checklistOk ? "text-green-600" : "text-red-600"}>{checklistFilled}/{checklistTotal}</span></div>
          <div>Фото: <span className={photoOk ? "text-green-600" : "text-red-600"}>{photoCount}</span></div>
          <div>Сумма: <span className={amountOk ? "text-green-600" : "text-red-600"}>{amountOk ? `${totalAmount?.toLocaleString("ru-RU")} ₽` : "—"}</span></div>
        </div>
        <Button onClick={onComplete} disabled={!canComplete} className="h-12 px-5">
          {pending ? "Завершение..." : "Завершить визит"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add src/components/visit/VisitTotalSection.tsx src/components/visit/VisitStickyBar.tsx
git commit -m "этап 8: UI — VisitTotalSection + VisitStickyBar"
```

---

## Task 15: PDF — установка шрифта Inter

**Files:**
- Create: `public/fonts/Inter-Regular.ttf` (через download)
- Create: `public/fonts/Inter-Bold.ttf` (через download)
- Create: `src/lib/pdf/font-config.ts`

- [ ] **Step 1:** Создать папку и скачать шрифты Inter (PowerShell)

```powershell
New-Item -ItemType Directory -Path public\fonts -Force
Invoke-WebRequest -Uri "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Regular.ttf" -OutFile public\fonts\Inter-Regular.ttf
Invoke-WebRequest -Uri "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Bold.ttf" -OutFile public\fonts\Inter-Bold.ttf
```

Expected: два .ttf файла по ~300 КБ каждый в `public/fonts/`.

- [ ] **Step 2:** Создать `src/lib/pdf/font-config.ts`:

```ts
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function ensureFontsRegistered() {
  if (registered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontsDir, "Inter-Regular.ttf") },
      { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Отключить hyphenation для русского — react-pdf по умолчанию делает дефисы по-английски
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
```

- [ ] **Step 3:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add public/fonts/Inter-Regular.ttf public/fonts/Inter-Bold.ttf src/lib/pdf/font-config.ts
git commit -m "этап 8: PDF — шрифт Inter (кириллица) + font-config"
```

---

## Task 16: PDF — VisitReportPdf компонент

**Files:**
- Create: `src/lib/pdf/VisitReportPdf.tsx`

- [ ] **Step 1:** Создать `src/lib/pdf/VisitReportPdf.tsx`:

```tsx
import path from "node:path";
import { existsSync } from "node:fs";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: {
    pool: { include: { customer: true } };
    serviceUser: true;
    checklistAnswers: { include: { question: true } };
    photos: true;
    extraWorks: true;
    chemistry: true;
  };
}>;

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, padding: 36, color: "#111" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "2 solid #0a0a0a",
    paddingBottom: 8,
    marginBottom: 16,
  },
  brand: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  title: { fontSize: 11, color: "#555" },
  metaTable: { marginBottom: 14 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 120, color: "#666" },
  metaValue: { flex: 1, fontWeight: 700 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #ddd" },
  qaRow: { flexDirection: "row", marginBottom: 3 },
  qaLabel: { flex: 1.3 },
  qaValue: { flex: 1, fontWeight: 700 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photo: { width: 150, height: 150, objectFit: "cover", marginRight: 6, marginBottom: 6 },
  table: { borderTop: "1 solid #ccc", borderLeft: "1 solid #ccc" },
  tr: { flexDirection: "row" },
  th: { borderRight: "1 solid #ccc", borderBottom: "1 solid #ccc", padding: 4, fontWeight: 700, backgroundColor: "#f5f5f5" },
  td: { borderRight: "1 solid #ccc", borderBottom: "1 solid #ccc", padding: 4 },
  totalRow: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end" },
  totalLabel: { fontSize: 12, marginRight: 16 },
  totalValue: { fontSize: 14, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#888" },
});

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtAnswer(type: string, raw: unknown): string {
  const decoded = decodeChecklistValue(type as never, raw);
  if (decoded === null) return "—";
  if (Array.isArray(decoded)) return decoded.length ? decoded.join(", ") : "—";
  if (typeof decoded === "boolean") return decoded ? "Выполнено" : "Не выполнено";
  if (typeof decoded === "string") return decoded.trim() === "" ? "—" : decoded;
  return "—";
}

export function VisitReportPdf({ visit }: { visit: VisitWithRelations }) {
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const photos = visit.photos.filter((p) => existsSync(path.join(uploadsRoot, p.path)));

  const works = [...visit.extraWorks].sort((a, b) => a.order - b.order);
  const chems = [...visit.chemistry].sort((a, b) => a.order - b.order);

  const totalLabel = visit.totalAmount
    ? `${Number(visit.totalAmount).toLocaleString("ru-RU")} ₽`
    : "—";

  const answers = [...visit.checklistAnswers].sort(
    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
  );

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>ХОРОШИЕ БАССЕЙНЫ</Text>
          <Text style={styles.title}>Отчёт о визите</Text>
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Клиент</Text>
            <Text style={styles.metaValue}>{visit.pool.customer.fullName}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Бассейн</Text>
            <Text style={styles.metaValue}>{visit.pool.name}{visit.pool.address ? `, ${visit.pool.address}` : ""}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Дата визита</Text>
            <Text style={styles.metaValue}>{formatDate(visit.scheduledAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Сервисник</Text>
            <Text style={styles.metaValue}>{visit.serviceUser.name ?? "—"}</Text>
          </View>
          {visit.completedAt && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Завершён</Text>
              <Text style={styles.metaValue}>{formatDate(visit.completedAt)}</Text>
            </View>
          )}
        </View>

        {answers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Чек-лист</Text>
            {answers.map((a) => (
              <View key={a.id} style={styles.qaRow}>
                <Text style={styles.qaLabel}>{a.question.label}</Text>
                <Text style={styles.qaValue}>
                  {fmtAnswer(a.question.type, a.value)}
                  {a.question.unit ? ` ${a.question.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {photos.length > 0 && (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Фото объекта</Text>
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <Image
                  key={p.id}
                  src={path.join(uploadsRoot, p.path)}
                  style={styles.photo}
                />
              ))}
            </View>
          </View>
        )}

        {works.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Доп.работы</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { flex: 4 }]}>Наименование</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Сумма</Text>
              </View>
              {works.map((w) => (
                <View key={w.id} style={styles.tr}>
                  <Text style={[styles.td, { flex: 4 }]}>{w.name}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                    {Number(w.price).toLocaleString("ru-RU")} ₽
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {chems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Химия</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { flex: 3 }]}>Позиция</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Кол-во</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Цена</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Сумма</Text>
              </View>
              {chems.map((c) => {
                const sum = Number(c.priceAtMoment) * Number(c.qty);
                return (
                  <View key={c.id} style={styles.tr}>
                    <Text style={[styles.td, { flex: 3 }]}>{c.nameAtMoment}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {Number(c.qty).toLocaleString("ru-RU")} {c.unitAtMoment}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {Number(c.priceAtMoment).toLocaleString("ru-RU")} ₽
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {sum.toLocaleString("ru-RU")} ₽
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ИТОГО К ОПЛАТЕ:</Text>
          <Text style={styles.totalValue}>{totalLabel}</Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `ХОРОШИЕ БАССЕЙНЫ · Сочи · стр. ${pageNumber} из ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
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
git add src/lib/pdf/VisitReportPdf.tsx
git commit -m "этап 8: PDF — VisitReportPdf компонент"
```

---

## Task 17: PDF — generate-visit-pdf функция

**Files:**
- Create: `src/lib/pdf/generate-visit-pdf.ts`

- [ ] **Step 1:** Создать `src/lib/pdf/generate-visit-pdf.ts`:

```ts
import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { ensureFontsRegistered } from "./font-config";
import { VisitReportPdf } from "./VisitReportPdf";

export async function generateVisitPdf(visitId: string): Promise<{ path: string }> {
  ensureFontsRegistered();

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: {
        include: { question: true },
        orderBy: { question: { order: "asc" } },
      },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });
  if (!visit) throw new Error("Визит не найден");

  const buffer = await renderToBuffer(<VisitReportPdf visit={visit} />);

  const dir = path.join(process.cwd(), "uploads", "reports-pdf", visitId);
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, "report.pdf");
  await writeFile(filepath, buffer);

  const relative = `reports-pdf/${visitId}/report.pdf`;
  await prisma.visit.update({
    where: { id: visitId },
    data: { pdfPath: relative, pdfGeneratedAt: new Date() },
  });

  return { path: relative };
}
```

- [ ] **Step 2:** В `next.config.ts` добавить `serverExternalPackages` для `@react-pdf/renderer` и `sharp`, чтобы их native deps не попадали в bundle:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
};

export default nextConfig;
```

- [ ] **Step 3:** Type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors. Build должен пройти, в логах `next build` могут быть предупреждения от react-pdf про node-canvas — это нормально.

- [ ] **Step 4:** Commit

```bash
git add src/lib/pdf/generate-visit-pdf.ts next.config.ts
git commit -m "этап 8: PDF — generate-visit-pdf + next.config serverExternalPackages"
```

---

## Task 18: Server action — completeVisitAction

**Files:**
- Modify: `src/lib/server-actions/visit-report.ts`

- [ ] **Step 1:** В `src/lib/server-actions/visit-report.ts` добавить (в конец):

```ts
import { generateVisitPdf } from "@/lib/pdf/generate-visit-pdf";

// =========================
// 9. Завершение визита
// =========================
export async function completeVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "in_progress") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не в статусе in_progress")}`);
  }

  const check = await checkVisitCanComplete(visitId);
  if (!check.ok) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent(check.errors.join("; "))}`);
  }

  const wasCompletedBefore = !!visit.pdfGeneratedAt;

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "completed", completedAt: new Date() },
  });

  await generateVisitPdf(visitId);

  await logActivity({
    actorId: actor.id,
    action: "visit.completed",
    entityType: "Visit",
    entityId: visitId,
    diff: {
      totalAmount: visit.totalAmount?.toString() ?? null,
      photoCount: check.photoCount,
      reopened: wasCompletedBefore,
    },
  });

  // Push клиенту
  const visitWithPool = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { pool: { select: { customer: { select: { id: true } } } } },
  });
  if (visitWithPool) {
    const userId = await getCustomerUserId(visitWithPool.pool.customer.id);
    if (userId) {
      await enqueuePush(
        wasCompletedBefore ? "visit_report_updated" : "visit_report_ready",
        [{ userId }],
        { visitId },
      );
    }
  }

  revalidatePath(`/service/visits/${visitId}`);
  revalidatePath(`/client/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит завершён, PDF готов")}`);
}
```

- [ ] **Step 2:** Type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/lib/server-actions/visit-report.ts
git commit -m "этап 8: server action — completeVisit (валидация + PDF + push)"
```

---

## Task 19: UI — VisitReadOnlyView (HTML-копия отчёта)

**Files:**
- Create: `src/components/visit/VisitReadOnlyView.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitReadOnlyView.tsx`:

```tsx
import type { Prisma } from "@prisma/client";
import { Card } from "@/components/Page";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";
import { formatMoscow } from "@/lib/calendar/dates";

export type VisitForReadOnly = Prisma.VisitGetPayload<{
  include: {
    pool: { include: { customer: true } };
    serviceUser: true;
    checklistAnswers: { include: { question: true } };
    photos: true;
    extraWorks: true;
    chemistry: true;
  };
}>;

function fmtAnswer(type: string, raw: unknown): string {
  const decoded = decodeChecklistValue(type as never, raw);
  if (decoded === null) return "—";
  if (Array.isArray(decoded)) return decoded.length ? decoded.join(", ") : "—";
  if (typeof decoded === "boolean") return decoded ? "Выполнено" : "Не выполнено";
  if (typeof decoded === "string") return decoded.trim() === "" ? "—" : decoded;
  return "—";
}

export function VisitReadOnlyView({ visit }: { visit: VisitForReadOnly }) {
  const answers = [...visit.checklistAnswers].sort(
    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
  );
  const works = [...visit.extraWorks].sort((a, b) => a.order - b.order);
  const chems = [...visit.chemistry].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-zinc-500">Клиент</dt>
          <dd>{visit.pool.customer.fullName}</dd>
          <dt className="text-zinc-500">Бассейн</dt>
          <dd>{visit.pool.name}</dd>
          <dt className="text-zinc-500">Дата</dt>
          <dd>{formatMoscow(visit.scheduledAt)}</dd>
          <dt className="text-zinc-500">Сервисник</dt>
          <dd>{visit.serviceUser.name ?? "—"}</dd>
          {visit.completedAt && (
            <>
              <dt className="text-zinc-500">Завершён</dt>
              <dd>{formatMoscow(visit.completedAt)}</dd>
            </>
          )}
        </dl>
      </Card>

      {answers.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Чек-лист</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {answers.map((a) => (
              <div key={a.id} className="flex justify-between gap-3 border-b border-zinc-100 pb-1.5">
                <dt className="text-zinc-600">{a.question.label}</dt>
                <dd className="text-right font-medium">
                  {fmtAnswer(a.question.type, a.value)}
                  {a.question.unit ? ` ${a.question.unit}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {visit.photos.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Фото объекта</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visit.photos.map((p) => (
              <a
                key={p.id}
                href={`/api/files/${p.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
              >
                <img src={`/api/files/${p.path}`} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {works.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Доп.работы</h3>
          <table className="w-full text-sm">
            <tbody>
              {works.map((w) => (
                <tr key={w.id} className="border-b border-zinc-100">
                  <td className="py-1.5">{w.name}</td>
                  <td className="py-1.5 text-right font-medium">
                    {Number(w.price).toLocaleString("ru-RU")} ₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {chems.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Химия</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="pb-1.5 text-left">Позиция</th>
                <th className="pb-1.5 text-right">Кол-во</th>
                <th className="pb-1.5 text-right">Цена</th>
                <th className="pb-1.5 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {chems.map((c) => {
                const sum = Number(c.priceAtMoment) * Number(c.qty);
                return (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="py-1.5">{c.nameAtMoment}</td>
                    <td className="py-1.5 text-right">{Number(c.qty).toLocaleString("ru-RU")} {c.unitAtMoment}</td>
                    <td className="py-1.5 text-right">{Number(c.priceAtMoment).toLocaleString("ru-RU")} ₽</td>
                    <td className="py-1.5 text-right font-medium">{sum.toLocaleString("ru-RU")} ₽</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between text-base">
          <span className="text-zinc-600">ИТОГО К ОПЛАТЕ:</span>
          <span className="text-xl font-bold">
            {visit.totalAmount ? `${Number(visit.totalAmount).toLocaleString("ru-RU")} ₽` : "—"}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Статус оплаты: Не оплачен (онлайн-оплата подключается на этапе 13).
        </p>
      </Card>
    </div>
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
git add src/components/visit/VisitReadOnlyView.tsx
git commit -m "этап 8: UI — VisitReadOnlyView (HTML-копия отчёта)"
```

---

## Task 20: Интеграция — /service/visits/[id]

**Files:**
- Create: `src/components/visit/VisitInProgressEditor.tsx` (client wrapper для секций со sticky-bar)
- Modify: `src/app/service/visits/[id]/page.tsx`

- [ ] **Step 1:** Создать `src/components/visit/VisitInProgressEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { ChecklistQuestion, Prisma } from "@prisma/client";
import { VisitChecklistSection } from "./VisitChecklistSection";
import { VisitPhotosSection } from "./VisitPhotosSection";
import { VisitExtraWorksSection } from "./VisitExtraWorksSection";
import { VisitChemistrySection } from "./VisitChemistrySection";
import { VisitTotalSection } from "./VisitTotalSection";
import { VisitStickyBar } from "./VisitStickyBar";
import { completeVisitAction } from "@/lib/server-actions/visit-report";

type Photo = { id: string; path: string; originalName?: string | null; uploadedAt: Date };
type Work = { id: string; name: string; price: string };
type ChemRow = {
  id: string;
  nameAtMoment: string;
  unitAtMoment: string;
  priceAtMoment: string;
  qty: string;
};
type ChemItem = { id: string; name: string; unit: string; price: string };

export function VisitInProgressEditor({
  visitId,
  questions,
  initialAnswers,
  photos,
  works,
  chemistry,
  chemistryCatalog,
  initialTotalAmount,
  initialChecklistFilled,
  totalRequired,
  hint,
}: {
  visitId: string;
  questions: ChecklistQuestion[];
  initialAnswers: Record<string, Prisma.JsonValue>;
  photos: Photo[];
  works: Work[];
  chemistry: ChemRow[];
  chemistryCatalog: ChemItem[];
  initialTotalAmount: string | null;
  initialChecklistFilled: number;
  totalRequired: number;
  hint: number;
}) {
  const [checklistFilled, setChecklistFilled] = useState(initialChecklistFilled);
  const [totalAmount, setTotalAmount] = useState<number | null>(
    initialTotalAmount ? Number(initialTotalAmount) : null,
  );
  const [pending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      await completeVisitAction(visitId);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4 pb-24">
        <VisitChecklistSection
          visitId={visitId}
          questions={questions}
          initialAnswers={initialAnswers}
          onProgressChange={(filled) => setChecklistFilled(filled)}
        />
        <VisitPhotosSection visitId={visitId} photos={photos} />
        <VisitExtraWorksSection visitId={visitId} works={works} />
        <VisitChemistrySection visitId={visitId} rows={chemistry} catalog={chemistryCatalog} />
        <VisitTotalSection
          visitId={visitId}
          initialAmount={initialTotalAmount}
          hint={hint}
          onAmountChange={setTotalAmount}
        />
      </div>

      <VisitStickyBar
        checklistFilled={checklistFilled}
        checklistTotal={totalRequired}
        photoCount={photos.length}
        totalAmount={totalAmount}
        onComplete={handleComplete}
        pending={pending}
      />
    </>
  );
}
```

- [ ] **Step 2:** Переписать `src/app/service/visits/[id]/page.tsx` целиком:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import { VisitInProgressEditor } from "@/components/visit/VisitInProgressEditor";
import { VisitReadOnlyView } from "@/components/visit/VisitReadOnlyView";
import {
  updateVisitAction,
  cancelVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import {
  startVisitAction,
  reopenVisitAction,
  listActiveChemistryItems,
} from "@/lib/server-actions/visit-report";
import { decodeChecklistValue, isAnswerEmpty } from "@/lib/visit/checklist-value";
import { formatMoscow } from "@/lib/calendar/dates";

const SERVICE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      pool: { include: { customer: true } },
      serviceUser: true,
      series: { select: { id: true, recurrence: true, occurrences: true } },
      onlineRequest: { select: { id: true } },
      checklistAnswers: { include: { question: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });

  if (!visit) {
    return (
      <>
        <Header />
        <PageContainer>
          <PageHeader title="Визит не найден" />
          <div className="mt-6"><Alert variant="error">Этот визит не существует.</Alert></div>
          <div className="mt-4">
            <Link href="/service/calendar"><Button variant="secondary">← В календарь</Button></Link>
          </div>
        </PageContainer>
      </>
    );
  }

  const isAdmin = session.user.role === "admin";
  const isOwnVisit = visit.serviceUserId === session.user.id;
  const withinEditWindow =
    visit.completedAt &&
    Date.now() - visit.completedAt.getTime() < SERVICE_EDIT_WINDOW_MS;
  const canReopen = isAdmin || (isOwnVisit && withinEditWindow);

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
            {visit.startedAt && (
              <><dt className="text-zinc-500">Начат</dt><dd>{formatMoscow(visit.startedAt)}</dd></>
            )}
            {visit.completedAt && (
              <><dt className="text-zinc-500">Завершён</dt><dd>{formatMoscow(visit.completedAt)}</dd></>
            )}
            {visit.totalAmount && (
              <><dt className="text-zinc-500">Сумма</dt><dd className="font-semibold">{Number(visit.totalAmount).toLocaleString("ru-RU")} ₽</dd></>
            )}
          </dl>
        </Card>

        {visit.status === "planned" && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Подготовка</h2>
            <p className="mb-3 text-sm text-zinc-600">
              Когда вы на объекте — нажмите «Начать визит», после этого появятся секции для заполнения.
            </p>
            <form action={startVisitAction.bind(null, visit.id)}>
              <Button type="submit" className="h-12 w-full text-base">
                Начать визит
              </Button>
            </form>
          </Card>
        )}

        {visit.status === "planned" && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Редактирование плана</h2>
            <VisitForm
              mode={{
                kind: "edit",
                visitId: visit.id,
                updateAction: updateVisitAction,
                checkConflicts: async (input) =>
                  (await checkVisitConflicts({
                    serviceUserId: input.serviceUserId,
                    scheduledAt: new Date(input.scheduledAt),
                    durationMinutes: input.durationMinutes,
                    excludeVisitId: input.excludeVisitId,
                  })).map((c) => ({
                    id: c.id,
                    scheduledAt: c.scheduledAt.toISOString(),
                    durationMinutes: c.durationMinutes,
                    customerName: c.customerName,
                    poolName: c.poolName,
                  })),
              }}
              customers={await prisma.customer.findMany({
                orderBy: { fullName: "asc" },
                select: {
                  id: true,
                  fullName: true,
                  pools: { orderBy: { name: "asc" }, select: { id: true, name: true } },
                },
              })}
              serviceUsers={await prisma.user.findMany({
                where: { role: { in: ["admin", "service"] }, active: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              })}
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

        {visit.status === "in_progress" && (
          <div className="mt-6">
            <VisitInProgressEditorWrapper visitId={visit.id} visit={visit} />
          </div>
        )}

        {visit.status === "completed" && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {visit.pdfPath && (
                <a href={`/api/files/${visit.pdfPath}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary">Скачать PDF</Button>
                </a>
              )}
              {canReopen && (
                <form action={reopenVisitAction.bind(null, visit.id)}>
                  <Button type="submit" variant="secondary">Редактировать</Button>
                </form>
              )}
            </div>
            <VisitReadOnlyView visit={visit} />
          </div>
        )}

        {visit.status === "canceled" && (
          <Alert variant="warning" className="mt-6">Визит отменён.</Alert>
        )}

        {(visit.status === "planned" || visit.status === "in_progress") && (
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
          <Link href="/service/calendar"><Button variant="secondary">← В календарь</Button></Link>
        </div>
      </PageContainer>
    </>
  );
}

// Server-component обёртка — собирает данные для editor и считает прогресс
async function VisitInProgressEditorWrapper({
  visitId,
  visit,
}: {
  visitId: string;
  visit: NonNullable<Awaited<ReturnType<typeof prisma.visit.findUnique>>> & {
    checklistAnswers: { questionId: string; value: unknown; question: { id: string; type: string; label: string; required: boolean; active: boolean } }[];
    photos: { id: string; path: string; originalName: string | null; uploadedAt: Date }[];
    extraWorks: { id: string; name: string; price: { toString(): string } }[];
    chemistry: {
      id: string;
      nameAtMoment: string;
      unitAtMoment: string;
      priceAtMoment: { toString(): string };
      qty: { toString(): string };
    }[];
  };
}) {
  const [questions, catalog] = await Promise.all([
    prisma.checklistQuestion.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    }),
    listActiveChemistryItems(),
  ]);

  const initialAnswers: Record<string, unknown> = {};
  for (const a of visit.checklistAnswers) {
    initialAnswers[a.questionId] = a.value;
  }

  const requiredQuestions = questions.filter((q) => q.required);
  const initialChecklistFilled = requiredQuestions.filter((q) => {
    const decoded = decodeChecklistValue(q.type, initialAnswers[q.id]);
    return !isAnswerEmpty(q.type, decoded);
  }).length;

  const works = visit.extraWorks.map((w) => ({
    id: w.id,
    name: w.name,
    price: w.price.toString(),
  }));
  const chemistry = visit.chemistry.map((c) => ({
    id: c.id,
    nameAtMoment: c.nameAtMoment,
    unitAtMoment: c.unitAtMoment,
    priceAtMoment: c.priceAtMoment.toString(),
    qty: c.qty.toString(),
  }));

  const worksSum = visit.extraWorks.reduce((s, w) => s + Number(w.price), 0);
  const chemSum = visit.chemistry.reduce(
    (s, c) => s + Number(c.priceAtMoment) * Number(c.qty),
    0,
  );
  const hint = worksSum + chemSum;

  return (
    <VisitInProgressEditor
      visitId={visitId}
      questions={questions}
      initialAnswers={initialAnswers as Record<string, never>}
      photos={visit.photos}
      works={works}
      chemistry={chemistry}
      chemistryCatalog={catalog.map((c) => ({
        id: c.id,
        name: c.name,
        unit: c.unit,
        price: c.price.toString(),
      }))}
      initialTotalAmount={visit.totalAmount ? visit.totalAmount.toString() : null}
      initialChecklistFilled={initialChecklistFilled}
      totalRequired={requiredQuestions.length}
      hint={hint}
    />
  );
}
```

- [ ] **Step 3:** Type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 4:** Smoke-тест вручную:

```bash
npm run dev
```

В браузере:
1. Логин как сервисник.
2. Открой `/service/calendar` → создай визит на текущий день, длительность 60 мин.
3. Перейди в карточку визита → жми «Начать визит» → редирект, статус `in_progress`.
4. Заполни 1-2 вопроса чек-листа → возле поля появляется «✓ сохранено».
5. Загрузи 1 фото (с десктопа любой jpeg) → появилось в сетке.
6. Добавь доп.работу «Тест — 100 ₽» → увидишь в списке.
7. Открой sticky-bar внизу → видны счётчики «Чек-лист X/Y · Фото 1 · Сумма —».

Если всё OK — переходим дальше.

- [ ] **Step 5:** Commit

```bash
git add src/components/visit/VisitInProgressEditor.tsx src/app/service/visits/[id]/page.tsx
git commit -m "этап 8: интеграция — /service/visits/[id] (planned/in_progress/completed/canceled)"
```

---

## Task 21: Клиентские страницы /client/visits

**Files:**
- Create: `src/app/client/visits/[id]/page.tsx`
- Create: `src/app/client/visits/page.tsx`
- Modify: `src/app/client/page.tsx` (виджет «Последние визиты»)

- [ ] **Step 1:** Создать `src/app/client/visits/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitReadOnlyView } from "@/components/visit/VisitReadOnlyView";

type Params = Promise<{ id: string }>;

export default async function ClientVisitPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: { include: { question: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });

  if (!visit) notFound();
  if (visit.pool.customer.userId !== session.user.id) {
    redirect("/client?error=" + encodeURIComponent("Доступ запрещён"));
  }

  if (visit.status !== "completed") {
    return (
      <>
        <Header />
        <PageContainer size="narrow">
          <PageHeader title="Визит" subtitle={visit.pool.name} />
          <div className="mt-6">
            <Alert variant="info">
              Отчёт ещё не готов — визит {visit.status === "canceled" ? "отменён" : "в процессе"}.
            </Alert>
          </div>
          <div className="mt-4"><Link href="/client/visits"><Button variant="secondary">← К списку визитов</Button></Link></div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader title="Отчёт о визите" subtitle={visit.pool.name} />

        {visit.pdfPath && (
          <div className="mt-4">
            <a href={`/api/files/${visit.pdfPath}`} target="_blank" rel="noopener noreferrer">
              <Button>Скачать PDF</Button>
            </a>
          </div>
        )}

        <div className="mt-6">
          <VisitReadOnlyView visit={visit} />
        </div>

        <div className="mt-6">
          <Link href="/client/visits"><Button variant="secondary">← К списку визитов</Button></Link>
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 2:** Создать `src/app/client/visits/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscow } from "@/lib/calendar/dates";

export default async function ClientVisitsListPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!customer) redirect("/client");

  const visits = await prisma.visit.findMany({
    where: { pool: { customerId: customer.id } },
    orderBy: { scheduledAt: "desc" },
    include: { pool: { select: { name: true } } },
  });

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader title="Мои визиты" />

        {visits.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-zinc-600">Пока визитов не было.</p>
          </Card>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {visits.map((v) => (
              <Card key={v.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-zinc-500">{formatMoscow(v.scheduledAt)} · {v.pool.name}</div>
                    <div className="mt-1 text-sm">
                      {v.status === "completed" && v.totalAmount ? (
                        <span>Сумма: <strong>{Number(v.totalAmount).toLocaleString("ru-RU")} ₽</strong></span>
                      ) : (
                        <span className="text-zinc-500">Статус: {v.status}</span>
                      )}
                    </div>
                  </div>
                  {v.status === "completed" ? (
                    <Link href={`/client/visits/${v.id}`}>
                      <Button variant="secondary" size="sm">Открыть отчёт</Button>
                    </Link>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link href="/client"><Button variant="secondary">← На главную</Button></Link>
        </div>
      </PageContainer>
    </>
  );
}
```

- [ ] **Step 3:** В `src/app/client/page.tsx` добавить виджет «Последние визиты». Найти секцию рендера главной клиента (карточки «Записаться» / «Мои заявки») и добавить новую карточку рядом или над списком бассейнов:

```tsx
// Добавить импорт сверху, если ещё нет:
import { formatMoscow } from "@/lib/calendar/dates";

// В функции страницы, перед rendering, добавить запрос:
const recentVisits = customer
  ? await prisma.visit.findMany({
      where: { pool: { customerId: customer.id }, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 3,
      include: { pool: { select: { name: true } } },
    })
  : [];

// В JSX добавить блок рядом с карточкой «Мои заявки»:
{recentVisits.length > 0 && (
  <Card>
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Последние визиты</h2>
      <Link href="/client/visits" className="text-sm text-blue-600 hover:underline">
        Все визиты →
      </Link>
    </div>
    <ul className="flex flex-col gap-2 text-sm">
      {recentVisits.map((v) => (
        <li key={v.id}>
          <Link href={`/client/visits/${v.id}`} className="flex justify-between rounded-md border border-zinc-200 px-3 py-2 hover:bg-zinc-50">
            <span>{formatMoscow(v.scheduledAt)} · {v.pool.name}</span>
            <span className="font-medium">
              {v.totalAmount ? `${Number(v.totalAmount).toLocaleString("ru-RU")} ₽` : "—"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </Card>
)}
```

(Точное расположение блока зависит от текущей структуры — вставить туда, где сейчас карточки `customer`. Если переменная называется иначе, использовать существующее имя.)

- [ ] **Step 4:** Type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 5:** Commit

```bash
git add src/app/client/visits/ src/app/client/page.tsx
git commit -m "этап 8: клиентские страницы /client/visits + виджет на главной"
```

---

## Task 22: Финал — обновить plan.md + полный smoke-тест

**Files:**
- Modify: `plan.md`

- [ ] **Step 1:** В корневом `plan.md` найти раздел `## Этап 8` и проставить галочки `[x]` для всех подзадач, обновить нижнюю строку `**Текущий статус:**`:

```markdown
## Этап 8. Визит, отчёт, PDF

- [x] Раздел `/service/visits/[id]` — мобильно-адаптивная страница визита
- [x] Динамический рендер чек-листа из `ChecklistQuestion`
- [x] Прикрепление фото визита (1+ фото, с компрессией через sharp)
- [x] Добавление доп.работ (название + сумма, можно несколько)
- [x] Добавление химии из прайса (выбор + количество, цена фиксируется на момент)
- [x] Кнопка «Завершить визит» → статус `completed`, генерация PDF
- [x] PDF: логотип «ХОРОШИЕ БАССЕЙНЫ», ФИО сервисника, дата, ответы чек-листа, фото, таблица доп.работ + химии, итоговая сумма
- [x] PDF сохраняется в `uploads/reports-pdf/{visit_id}/report.pdf`
- [x] Клиент видит отчёт в `/client/visits/[id]` (PDF + html-копия)
- [x] Возможность редактирования отчёта сервисником после завершения (логируется в ActivityLog)

**Чекпойнт:** Сервисник с телефона открывает запланированный визит → заполняет чек-лист → прикрепляет фото → добавляет «Замена картриджа — 1500 ₽» и «Хлор 5 кг» → завершает → клиент в своём ЛК видит PDF.
```

И в самом низу файла:

```markdown
**Текущий статус:** этап 7 принят клиентом. Этап 8 (Визит, отчёт, PDF) реализован, ждёт чекпойнта от юзера. Этапы 9-17 — pending.
```

- [ ] **Step 2:** Полный E2E smoke-тест:

```bash
npm run dev
```

Сценарий (выполнить вручную, отметить когда отработало):

1. Логин как сервисник, открыть запланированный визит из этапа 7.
2. Жми «Начать визит» → status: in_progress.
3. Заполни 25 вопросов чек-листа (можно тестово text-вопросы заполнять одной буквой; для select — выбрать первый вариант).
4. Загрузить 2 фото (любые jpg/png).
5. Добавить доп.работу «Замена картриджа — 1500».
6. Добавить химию: «Хлор гранулированный — 5 кг» (из прайса этапа 8).
7. Ввести сумму «7500».
8. Жми «Завершить визит» → редирект, status: completed, в админ-логах появилось `visit.completed`.
9. Скачать PDF → открывается, кириллица читается, фото есть, итоговая сумма 7500 ₽.
10. Логин как клиент (владелец этого бассейна) → `/client` → видит виджет «Последние визиты» → кликает → попадает в `/client/visits/{id}` → видит HTML-вид + кнопку «Скачать PDF».
11. Снова логин как админ → открыть тот же визит → кнопка «Редактировать» доступна → жми → status снова in_progress → меняем сумму на 7000 → «Завершить» → проверь файл `uploads/reports-pdf/{id}/report.pdf` (новая mtime), в логах `visit.completed` с `reopened: true`, в push-stub в логах `visit_report_updated`.

- [ ] **Step 3:** Final type-check + build

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add plan.md
git commit -m "этап 8: финал — отметка прогресса в plan.md"
```

- [ ] **Step 5:** Сообщи юзеру:

> «Этап 8 готов. Прогон чекпойнта: заполни визит на тестовых данных → заверши → проверь, что клиент видит HTML-копию и скачивает PDF с кириллицей. После подтверждения отметим в plan.md `[x]` финально и переходим к этапу 9 (admin-CRUD прайса химии).»

---

## Self-review

(Сделано перед сдачей плана.)

**Spec coverage:**
- Все 16 разделов спеки покрыты задачами 0–22.
- §4 (модели) → Task 1 + Task 2 (сидер).
- §5 (UX страницы) → Tasks 10–14, 20.
- §6 (UX клиента) → Task 19, 21.
- §7 (PDF) → Tasks 15–17.
- §8 (server actions) → Tasks 5–9, 18.
- §9 (валидация) → Task 4 (validation lib) + Task 18 (используется в complete).
- §10 (ActivityLog) → распределено по всем actions.
- §11 (права) → Task 5 (reopen ограничения) + Task 20 (canReopen в page).
- §13 (smoke-тесты) → Task 22.

**Placeholder scan:** проверено, плейсхолдеров нет, все шаги содержат код, экспортируемые типы и функции согласованы.

**Type consistency:** имя метода `saveChecklistAnswerAction`, `addExtraWorkAction`, `addVisitChemistryAction`, `completeVisitAction` едины во всех задачах. Тип `ChecklistValue` импортируется из `@/lib/visit/checklist-value`. Тип `VisitForReadOnly` совпадает между PDF-компонентом и read-only view (оба используют одинаковый `Prisma.VisitGetPayload<{include: ...}>`).
