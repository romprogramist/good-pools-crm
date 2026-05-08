# Этап 6 — Чек-лист (динамическая схема). План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать админу `/admin/checklist` для управления вопросами чек-листа: 25 вопросов из существующей Google-формы, drag-drop сортировка, редактирование, soft-delete, превью «как видит сервисник». Без модели ответов (это этап 8).

**Architecture:** Новая таблица `ChecklistQuestion` в Postgres + сидер из `prisma/seeds/checklist.ts`. Server actions в `src/lib/server-actions/checklist.ts` (паттерн `equipment-templates.ts`). Страница `/admin/checklist` — server-component с inline-формами через query-параметры (`?tab=`, `?new=<type>`, `?edit=<id>`) — как `/admin/users`, поскольку shadcn `Dialog` в проекте не установлен. Drag-drop — единственный обязательный client-component (`@dnd-kit/sortable`).

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres, TypeScript strict, Tailwind 4, zod, `@dnd-kit/core` + `@dnd-kit/sortable` (новые зависимости), Auth.js v5.

**Связанная спека:** `docs/superpowers/specs/2026-05-08-checklist-design.md`

**Project conventions to follow strictly:**
- Server actions: `"use server"`, `requireAdmin()` в начале, `z.safeParse(formData)`, `redirect` с `?ok=` / `?error=`, `revalidatePath`, `logActivity`.
- Pages: server-components, проверка `session.user.role !== "admin"` в начале, `<Header />`, `<PageContainer><PageHeader>...`.
- UI: `Card`, `FormField`, `Alert`, `Button`, `Input`, `Label` (всё уже есть в `src/components/`).
- Redirects after action: `redirect("/admin/checklist?ok=" + encodeURIComponent("..."))`.

---

## Task 0: Установить @dnd-kit и обновить package.json

**Files:**
- Modify: `package.json` (auto via npm)
- Modify: `package-lock.json` (auto)

- [ ] **Step 1:** Установить пакеты

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2:** Проверить, что версии записались в `package.json` → секция `dependencies`. Ожидается появление строк (версии могут отличаться):

```json
"@dnd-kit/core": "^6.x.x",
"@dnd-kit/sortable": "^10.x.x",
"@dnd-kit/utilities": "^3.x.x"
```

- [ ] **Step 3:** Type-check проходит

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit

```bash
git add package.json package-lock.json
git commit -m "этап 6: deps — @dnd-kit для drag-drop"
```

---

## Task 1: Prisma — enum + модель ChecklistQuestion + миграция

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260508xxxxxx_checklist_init/migration.sql` (auto)

- [ ] **Step 1:** Добавить enum после существующего `enum InstructionKind` в `prisma/schema.prisma`:

```prisma
enum ChecklistQuestionType {
  text
  number
  single_select
  multi_select
  bool
}
```

- [ ] **Step 2:** Добавить модель `ChecklistQuestion` в конец файла (после `VerificationToken`):

```prisma
model ChecklistQuestion {
  id          String                @id @default(cuid())
  order       Int
  type        ChecklistQuestionType
  label       String
  placeholder String?
  unit        String?
  options     Json?
  required    Boolean               @default(true)
  active      Boolean               @default(true)
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([order])
  @@index([active])
}
```

- [ ] **Step 3:** Сгенерировать миграцию

```bash
npx prisma migrate dev --name checklist_init
```

Expected output: `Applying migration ...checklist_init`, в `prisma/migrations/` появилась новая папка с `migration.sql`.

- [ ] **Step 4:** Проверить sql-файл миграции — там должны быть `CREATE TYPE "ChecklistQuestionType"` и `CREATE TABLE "ChecklistQuestion"`. Type-check:

```bash
npx tsc --noEmit
```

Expected: 0 errors (типы Prisma сгенерированы автоматически).

- [ ] **Step 5:** Commit

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "этап 6: prisma — ChecklistQuestion + enum типов"
```

---

## Task 2: Сидер из Google-формы

**Files:**
- Create: `prisma/seeds/checklist.ts`
- Modify: `package.json` (добавить script)

- [ ] **Step 1:** Создать `prisma/seeds/checklist.ts`:

```typescript
import { config } from "dotenv";
import { PrismaClient, ChecklistQuestionType } from "@prisma/client";

config();

const prisma = new PrismaClient();

type SeedQuestion = {
  label: string;
  type: ChecklistQuestionType;
  required: boolean;
  unit?: string;
  options?: string[];
};

const QUESTIONS: SeedQuestion[] = [
  { label: "УРОВЕНЬ pH", type: "number", required: true },
  { label: "УРОВЕНЬ СВОБОДНОГО ХЛОРА", type: "number", required: true, unit: "мг/л" },
  { label: "УРОВЕНЬ СВЯЗАННОГО ХЛОРА", type: "number", required: true, unit: "мг/л" },
  { label: "УРОВЕНЬ ЩЁЛОЧНОСТИ", type: "number", required: true, unit: "мг/л" },
  { label: "СОДЕРЖАНИЕ СОЛИ", type: "number", required: false, unit: "г/л" },
  { label: "УРОВЕНЬ ЦИАНУРОВОЙ КИСЛОТЫ", type: "number", required: false, unit: "мг/л" },
  { label: "ПРОМЫВКА ФИЛЬТРА", type: "bool", required: true },
  { label: "ДАВЛЕНИЕ В СИСТЕМЕ ФИЛЬТРАЦИИ", type: "number", required: true, unit: "бар" },
  {
    label: "РАБОТА НАСОСНЫХ АГРЕГАТОВ",
    type: "multi_select",
    required: true,
    options: ["НОРМАЛЬНАЯ", "ПОСТОРОННИЕ ШУМЫ", "ПЕРЕГРЕВ", "НЕОБХОДИМ РЕМОНТ"],
  },
  {
    label: "СОСТОЯНИЕ ДОННОГО ПЫЛЕСОСА",
    type: "single_select",
    required: true,
    options: ["ИСПРАВЕН", "ТРЕБУЕТ РЕМОНТА ИЛИ ЗАМЕНЫ"],
  },
  {
    label: "РАБОТА ЭЛЕКТРИЧЕСКОГО ЩИТА",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "РАБОТА АВТОМАТИЧЕСКОГО ДОЛИВА ВОДЫ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ НАСТРОЙКИ", "НЕИСПРАВНО", "ОТКЛЮЧЕНО"],
  },
  {
    label: "ПОДОГРЕВ В БАССЕЙНЕ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "ПОДСВЕТКА БАССЕЙНА",
    type: "single_select",
    required: true,
    options: ["ИСПРАВНА", "ТРЕБУЕТ РЕМОНТА"],
  },
  {
    label: "РАБОТА АТТРАКЦИОНОВ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "СОСТОЯНИЕ ТЕПЛОСБЕРЕГАЮЩЕГО ПОКРЫТИЯ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ", "НЕИСПРАВНО"],
  },
  {
    label: "АВТОМАТИЧЕСКОЕ ДОЗИРОВАНИЕ РЕАГЕНТОВ",
    type: "single_select",
    required: true,
    options: ["РАБОТАЕТ", "ТРЕБУЕТ ОБСЛУЖИВАНИЯ"],
  },
  {
    label: "СОСТОЯНИЕ ЗАКЛАДНЫХ ЭЛЕМЕНТОВ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "УБОРКА ЧАШИ БАССЕЙНА",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "УБОРКА БОРТОВОГО КАМНЯ",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "УБОРКА ТЕХНИЧЕСКОГО ПОМЕЩЕНИЯ",
    type: "single_select",
    required: true,
    options: ["ВЫПОЛНЕНА", "НЕ ТРЕБУЕТСЯ"],
  },
  {
    label: "СОСТОЯНИЕ ОБЛИЦОВОЧНЫХ ПОКРЫТИЙ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  {
    label: "СОСТОЯНИЕ ПЕРЕЛИВНОЙ ЁМКОСТИ",
    type: "single_select",
    required: true,
    options: ["НОРМАЛЬНО", "ТРЕБУЕТ ВНИМАНИЯ"],
  },
  { label: "РУЧНОЕ ВНЕСЕНИЕ ХИМИЧЕСКИХ РЕАГЕНТОВ", type: "text", required: true },
  {
    label: "ЗАПАС ХИМИЧЕСКИХ РЕАГЕНТОВ",
    type: "single_select",
    required: true,
    options: ["ДОСТАТОЧНО", "ТРЕБУЕТ ПОПОЛНЕНИЯ"],
  },
];

async function main() {
  const existing = await prisma.checklistQuestion.count();
  if (existing > 0) {
    console.log(`⏭  В базе уже ${existing} вопросов чек-листа. Сидер пропущен.`);
    return;
  }

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    await prisma.checklistQuestion.create({
      data: {
        order: i + 1,
        type: q.type,
        label: q.label,
        required: q.required,
        unit: q.unit ?? null,
        options: q.options ?? undefined,
      },
    });
  }
  console.log(`✓ Засеяно ${QUESTIONS.length} вопросов чек-листа.`);
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

- [ ] **Step 2:** Добавить npm-script в `package.json` (в секцию `"scripts"`):

```json
"db:seed:checklist": "tsx prisma/seeds/checklist.ts"
```

- [ ] **Step 3:** Запустить сидер

```bash
npm run db:seed:checklist
```

Expected: `✓ Засеяно 25 вопросов чек-листа.`

- [ ] **Step 4:** Повторный запуск — проверка идемпотентности

```bash
npm run db:seed:checklist
```

Expected: `⏭  В базе уже 25 вопросов чек-листа. Сидер пропущен.`

- [ ] **Step 5:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Commit

```bash
git add prisma/seeds/checklist.ts package.json package-lock.json
git commit -m "этап 6: сидер 25 вопросов чек-листа из Google-формы"
```

---

## Task 3: Server actions для CRUD вопросов

**Files:**
- Create: `src/lib/server-actions/checklist.ts`

- [ ] **Step 1:** Создать `src/lib/server-actions/checklist.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, ChecklistQuestionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

function back(params: Record<string, string>): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/admin/checklist${search ? "?" + search : ""}`);
}

const TypeEnum = z.nativeEnum(ChecklistQuestionType);

const QuestionSchema = z
  .object({
    type: TypeEnum,
    label: z.string().trim().min(1, "Текст вопроса обязателен").max(200),
    placeholder: z.string().trim().max(100).optional().or(z.literal("")),
    unit: z.string().trim().max(20).optional().or(z.literal("")),
    options: z.array(z.string().trim().min(1)).optional(),
    required: z.boolean(),
  })
  .superRefine((val, ctx) => {
    const isSelect = val.type === "single_select" || val.type === "multi_select";
    if (isSelect) {
      if (!val.options || val.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Нужно минимум 2 варианта",
          path: ["options"],
        });
      }
    }
    if (val.unit && val.type !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Единица измерения только для числовых вопросов",
        path: ["unit"],
      });
    }
  });

function readForm(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const label = String(formData.get("label") ?? "");
  const placeholder = String(formData.get("placeholder") ?? "");
  const unit = String(formData.get("unit") ?? "");
  const required = formData.get("required") === "on";
  const optionsRaw = formData.getAll("options").map((o) => String(o).trim()).filter(Boolean);
  return {
    type: type as ChecklistQuestionType,
    label,
    placeholder: placeholder || undefined,
    unit: unit || undefined,
    required,
    options: optionsRaw.length > 0 ? optionsRaw : undefined,
  };
}

export async function createQuestionAction(formData: FormData) {
  const actor = await requireAdmin();

  const parsed = QuestionSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    back({ error: encodeURIComponent(msg), new: String(formData.get("type") ?? "") });
  }

  const max = await prisma.checklistQuestion.aggregate({ _max: { order: true } });
  const nextOrder = (max._max.order ?? 0) + 1;

  const isSelect =
    parsed.data.type === "single_select" || parsed.data.type === "multi_select";

  const created = await prisma.checklistQuestion.create({
    data: {
      order: nextOrder,
      type: parsed.data.type,
      label: parsed.data.label,
      placeholder: parsed.data.placeholder ?? null,
      unit: parsed.data.type === "number" ? (parsed.data.unit ?? null) : null,
      options: isSelect ? (parsed.data.options as Prisma.InputJsonValue) : Prisma.JsonNull,
      required: parsed.data.required,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "checklist.question.create",
    entityType: "ChecklistQuestion",
    entityId: created.id,
    diff: {
      label: created.label,
      type: created.type,
      required: created.required,
      options: created.options as unknown,
    },
  });

  revalidatePath("/admin/checklist");
  back({ ok: encodeURIComponent("Вопрос добавлен") });
}

export async function updateQuestionAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) back({ error: encodeURIComponent("Не указан вопрос") });

  const before = await prisma.checklistQuestion.findUnique({ where: { id } });
  if (!before) back({ error: encodeURIComponent("Вопрос не найден") });

  // Тип менять нельзя — берём из БД, игнорируем форму
  const data = { ...readForm(formData), type: before.type };
  const parsed = QuestionSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Проверьте поля формы";
    back({ error: encodeURIComponent(msg), edit: id });
  }

  const isSelect =
    parsed.data.type === "single_select" || parsed.data.type === "multi_select";

  const updated = await prisma.checklistQuestion.update({
    where: { id },
    data: {
      label: parsed.data.label,
      placeholder: parsed.data.placeholder ?? null,
      unit: parsed.data.type === "number" ? (parsed.data.unit ?? null) : null,
      options: isSelect ? (parsed.data.options as Prisma.InputJsonValue) : Prisma.JsonNull,
      required: parsed.data.required,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "checklist.question.update",
    entityType: "ChecklistQuestion",
    entityId: id,
    diff: {
      before: {
        label: before.label,
        required: before.required,
        options: before.options as unknown,
        unit: before.unit,
        placeholder: before.placeholder,
      },
      after: {
        label: updated.label,
        required: updated.required,
        options: updated.options as unknown,
        unit: updated.unit,
        placeholder: updated.placeholder,
      },
    },
  });

  revalidatePath("/admin/checklist");
  back({ ok: encodeURIComponent("Вопрос сохранён") });
}

export async function reorderQuestionsAction(orderedIds: string[]) {
  const actor = await requireAdmin();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false as const, error: "Пустой список" };
  }

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.checklistQuestion.update({
        where: { id },
        data: { order: idx + 1 },
      }),
    ),
  );

  await logActivity({
    actorId: actor.id,
    action: "checklist.question.reorder",
    entityType: "ChecklistQuestion",
    diff: { ids: orderedIds },
  });

  revalidatePath("/admin/checklist");
  return { ok: true as const };
}

export async function setQuestionActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) back({ error: encodeURIComponent("Не указан вопрос") });

  const q = await prisma.checklistQuestion.findUnique({ where: { id } });
  if (!q) back({ error: encodeURIComponent("Вопрос не найден") });

  await prisma.checklistQuestion.update({ where: { id }, data: { active } });

  await logActivity({
    actorId: actor.id,
    action: active ? "checklist.question.activate" : "checklist.question.deactivate",
    entityType: "ChecklistQuestion",
    entityId: id,
  });

  revalidatePath("/admin/checklist");
  back({
    ok: encodeURIComponent(active ? "Вопрос активирован" : "Вопрос скрыт"),
  });
}
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Lint

```bash
npm run lint
```

Expected: 0 errors / 0 warnings (либо то же количество, что было до изменений).

- [ ] **Step 4:** Commit

```bash
git add src/lib/server-actions/checklist.ts
git commit -m "этап 6: server actions — CRUD вопросов чек-листа"
```

---

## Task 4: Reusable компонент `ChecklistFieldRenderer`

**Files:**
- Create: `src/components/checklist/ChecklistFieldRenderer.tsx`

- [ ] **Step 1:** Создать `src/components/checklist/ChecklistFieldRenderer.tsx`:

```tsx
"use client";

import type { ChecklistQuestion } from "@prisma/client";
import { Input } from "@/components/ui/input";

type Value = string | string[] | boolean | null;

export function ChecklistFieldRenderer({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: Pick<
    ChecklistQuestion,
    "id" | "type" | "label" | "placeholder" | "unit" | "options" | "required"
  >;
  value?: Value;
  onChange?: (next: Value) => void;
  disabled?: boolean;
}) {
  const opts = Array.isArray(question.options) ? (question.options as string[]) : [];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-700">
        {question.label}
        {question.required && <span className="ml-1 text-red-600">*</span>}
      </label>

      {question.type === "text" && (
        <Input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={question.placeholder ?? undefined}
          disabled={disabled}
          className="h-11 text-base"
        />
      )}

      {question.type === "number" && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange?.(e.target.value.replace(",", "."))}
            placeholder={question.placeholder ?? undefined}
            disabled={disabled}
            className="h-11 flex-1 text-base"
          />
          {question.unit && (
            <span className="text-sm text-zinc-500">{question.unit}</span>
          )}
        </div>
      )}

      {question.type === "single_select" && (
        <div className="flex flex-col gap-2">
          {opts.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="radio"
                name={`q-${question.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange?.(opt)}
                disabled={disabled}
                className="h-4 w-4 accent-teal-600"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {question.type === "multi_select" && (
        <div className="flex flex-col gap-2">
          {opts.map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  onChange={(e) => {
                    if (!onChange) return;
                    if (e.target.checked) onChange([...arr, opt]);
                    else onChange(arr.filter((v) => v !== opt));
                  }}
                  disabled={disabled}
                  className="h-4 w-4 accent-teal-600"
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "bool" && (
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange?.(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-teal-600"
          />
          ВЫПОЛНЕНО
        </label>
      )}
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
git add src/components/checklist/ChecklistFieldRenderer.tsx
git commit -m "этап 6: ChecklistFieldRenderer — рендер одного вопроса (5 типов)"
```

---

## Task 5: Drag-drop список — `ChecklistAdminList`

**Files:**
- Create: `src/components/checklist/ChecklistAdminList.tsx`

- [ ] **Step 1:** Создать `src/components/checklist/ChecklistAdminList.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistQuestion } from "@prisma/client";
import { reorderQuestionsAction, setQuestionActiveAction } from "@/lib/server-actions/checklist";

type Q = Pick<
  ChecklistQuestion,
  "id" | "order" | "type" | "label" | "required" | "unit" | "options" | "active"
>;

const TYPE_LABEL: Record<Q["type"], string> = {
  text: "Текст",
  number: "Число",
  single_select: "Один из списка",
  multi_select: "Несколько из списка",
  bool: "Да/Нет",
};

const TYPE_BADGE: Record<Q["type"], string> = {
  text: "bg-sky-100 text-sky-800",
  number: "bg-violet-100 text-violet-800",
  single_select: "bg-amber-100 text-amber-800",
  multi_select: "bg-orange-100 text-orange-800",
  bool: "bg-emerald-100 text-emerald-800",
};

export function ChecklistAdminList({ initial }: { initial: Q[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startTransition(async () => {
      const res = await reorderQuestionsAction(reordered.map((i) => i.id));
      if (!res.ok) {
        setError(res.error ?? "Не удалось сохранить порядок");
        setItems(items); // откат
      } else {
        setError(null);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
        Активных вопросов нет. Добавь первый через кнопку выше.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">
          {error}
        </div>
      )}
      {pending && (
        <div className="text-xs text-zinc-500">Сохраняем порядок…</div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((q) => (
            <SortableRow key={q.id} q={q} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({ q }: { q: Q }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const opts = Array.isArray(q.options) ? (q.options as string[]) : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
        className="cursor-grab touch-none rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[q.type]}`}>
            {TYPE_LABEL[q.type]}
          </span>
          <span className="truncate text-sm font-medium text-zinc-900">{q.label}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {q.required && <span>обязательный</span>}
          {q.unit && <span>ед.: {q.unit}</span>}
          {opts.length > 0 && <span>вариантов: {opts.length}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/admin/checklist?edit=${q.id}`}
          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
        >
          Изменить
        </Link>
        <form action={setQuestionActiveAction}>
          <input type="hidden" name="id" value={q.id} />
          <input type="hidden" name="active" value="false" />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            Скрыть
          </button>
        </form>
      </div>
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
git add src/components/checklist/ChecklistAdminList.tsx
git commit -m "этап 6: ChecklistAdminList — drag-drop сортировка @dnd-kit"
```

---

## Task 6: Превью «как видит сервисник»

**Files:**
- Create: `src/components/checklist/ChecklistPreview.tsx`

- [ ] **Step 1:** Создать `src/components/checklist/ChecklistPreview.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ChecklistQuestion } from "@prisma/client";
import { ChecklistFieldRenderer } from "./ChecklistFieldRenderer";

type Q = Pick<
  ChecklistQuestion,
  "id" | "type" | "label" | "placeholder" | "unit" | "options" | "required"
>;

export function ChecklistPreview({ questions }: { questions: Q[] }) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
        Активных вопросов нет — превью пустое.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:p-6">
      <div className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
        Так увидит чек-лист сервисник на визите. Ответы тут не сохраняются.
      </div>
      <div className="flex flex-col gap-5">
        {questions.map((q) => (
          <ChecklistFieldRenderer
            key={q.id}
            question={q}
            value={(values[q.id] as never) ?? null}
            onChange={(next) => setValues((s) => ({ ...s, [q.id]: next }))}
          />
        ))}
      </div>
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
git add src/components/checklist/ChecklistPreview.tsx
git commit -m "этап 6: ChecklistPreview — превью для админа"
```

---

## Task 7: Форма создания/редактирования (URL-state, server-rendered)

**Files:**
- Create: `src/components/checklist/ChecklistQuestionForm.tsx`

- [ ] **Step 1:** Создать `src/components/checklist/ChecklistQuestionForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChecklistQuestion, ChecklistQuestionType } from "@prisma/client";
import { Card, FormField } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createQuestionAction,
  updateQuestionAction,
} from "@/lib/server-actions/checklist";

type Mode =
  | { kind: "create"; type: ChecklistQuestionType }
  | { kind: "edit"; question: ChecklistQuestion };

const TYPE_TITLE: Record<ChecklistQuestionType, string> = {
  text: "текст",
  number: "число",
  single_select: "один из списка",
  multi_select: "несколько из списка",
  bool: "да/нет",
};

export function ChecklistQuestionForm({ mode }: { mode: Mode }) {
  const type = mode.kind === "create" ? mode.type : mode.question.type;
  const initialOptions =
    mode.kind === "edit" && Array.isArray(mode.question.options)
      ? (mode.question.options as string[])
      : type === "single_select" || type === "multi_select"
        ? ["", ""]
        : [];

  const [options, setOptions] = useState<string[]>(initialOptions);
  const isSelect = type === "single_select" || type === "multi_select";
  const isNumber = type === "number";
  const isText = type === "text";

  const action = mode.kind === "create" ? createQuestionAction : updateQuestionAction;
  const title =
    mode.kind === "create"
      ? `Новый вопрос — ${TYPE_TITLE[type]}`
      : `Редактирование — ${TYPE_TITLE[type]}`;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <Link
          href="/admin/checklist"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Закрыть
        </Link>
      </div>

      <form action={action} className="mt-5 space-y-4">
        {mode.kind === "edit" && (
          <input type="hidden" name="id" value={mode.question.id} />
        )}
        <input type="hidden" name="type" value={type} />

        <FormField label="Текст вопроса" htmlFor="label">
          <Input
            id="label"
            name="label"
            required
            maxLength={200}
            defaultValue={mode.kind === "edit" ? mode.question.label : ""}
            className="h-11 text-base"
            placeholder="Например: Уровень pH"
          />
        </FormField>

        {(isText || isNumber) && (
          <FormField label="Подсказка (placeholder)" htmlFor="placeholder" hint="Короткая подсказка в поле ввода — необязательно">
            <Input
              id="placeholder"
              name="placeholder"
              maxLength={100}
              defaultValue={mode.kind === "edit" ? (mode.question.placeholder ?? "") : ""}
              className="h-11 text-base"
              placeholder="Например: 7.0–7.6"
            />
          </FormField>
        )}

        {isNumber && (
          <FormField label="Единица измерения" htmlFor="unit" hint="Например: мг/л, бар, г/л">
            <Input
              id="unit"
              name="unit"
              maxLength={20}
              defaultValue={mode.kind === "edit" ? (mode.question.unit ?? "") : ""}
              className="h-11 text-base"
            />
          </FormField>
        )}

        {isSelect && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">Варианты ответа</span>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  name="options"
                  value={opt}
                  onChange={(e) =>
                    setOptions((s) => s.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  required
                  maxLength={100}
                  className="h-11 flex-1 text-base"
                  placeholder={`Вариант ${idx + 1}`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((s) => s.filter((_, i) => i !== idx))}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Убрать
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((s) => [...s, ""])}
              className="self-start text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              + Добавить вариант
            </button>
            <p className="text-xs text-zinc-500">Минимум 2 варианта.</p>
          </div>
        )}

        <FormField label="Обязательность" htmlFor="required" hint="Сервисник не сможет завершить визит без ответа на этот вопрос">
          <label className="flex items-center gap-2 text-sm">
            <input
              id="required"
              name="required"
              type="checkbox"
              defaultChecked={mode.kind === "edit" ? mode.question.required : true}
              className="h-4 w-4 accent-teal-600"
            />
            Обязательный
          </label>
        </FormField>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {mode.kind === "create" ? "Добавить" : "Сохранить"}
          </Button>
          <Link
            href="/admin/checklist"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
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
git add src/components/checklist/ChecklistQuestionForm.tsx
git commit -m "этап 6: ChecklistQuestionForm — форма create/edit"
```

---

## Task 8: Страница `/admin/checklist`

**Files:**
- Create: `src/app/admin/checklist/page.tsx`

- [ ] **Step 1:** Создать `src/app/admin/checklist/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ChecklistQuestionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { ChecklistAdminList } from "@/components/checklist/ChecklistAdminList";
import { ChecklistPreview } from "@/components/checklist/ChecklistPreview";
import { ChecklistQuestionForm } from "@/components/checklist/ChecklistQuestionForm";
import { setQuestionActiveAction } from "@/lib/server-actions/checklist";

type Tab = "active" | "hidden" | "preview";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "hidden", label: "Скрытые" },
  { value: "preview", label: "Превью" },
];

const NEW_TYPE_OPTIONS: {
  type: ChecklistQuestionType;
  label: string;
  hint: string;
}[] = [
  { type: "text", label: "Текст", hint: "Свободный ввод" },
  { type: "number", label: "Число", hint: "С опц. ед. изм." },
  { type: "single_select", label: "Один из списка", hint: "Радио-кнопки" },
  { type: "multi_select", label: "Несколько из списка", hint: "Чекбоксы" },
  { type: "bool", label: "Да/Нет", hint: "Один чекбокс" },
];

const TYPE_VALUES: ChecklistQuestionType[] = [
  "text",
  "number",
  "single_select",
  "multi_select",
  "bool",
];

export default async function AdminChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    new?: string;
    edit?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const tab = (TAB_OPTIONS.find((t) => t.value === params.tab)?.value ?? "active") as Tab;

  const newType =
    params.new && TYPE_VALUES.includes(params.new as ChecklistQuestionType)
      ? (params.new as ChecklistQuestionType)
      : null;

  const editing = params.edit
    ? await prisma.checklistQuestion.findUnique({ where: { id: params.edit } })
    : null;

  const showNewPicker = params.new === "1";

  const allActive = await prisma.checklistQuestion.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  const allHidden = await prisma.checklistQuestion.findMany({
    where: { active: false },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Чек-лист"
          subtitle="Универсальный список вопросов для сервисного обслуживания"
          actions={
            <Link
              href="/admin/checklist?new=1"
              className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
            >
              + Добавить вопрос
            </Link>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{decodeURIComponent(params.ok)}</Alert>}
          {params.error && <Alert variant="error">{decodeURIComponent(params.error)}</Alert>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TAB_OPTIONS.map((t) => (
            <Link
              key={t.value}
              href={t.value === "active" ? "/admin/checklist" : `/admin/checklist?tab=${t.value}`}
              className={
                tab === t.value
                  ? "inline-flex h-9 items-center rounded-full bg-teal-600 px-4 text-sm font-medium text-white shadow-sm"
                  : "inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
              }
            >
              {t.label}
              {t.value === "active" && (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {allActive.length}
                </span>
              )}
              {t.value === "hidden" && allHidden.length > 0 && (
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                  {allHidden.length}
                </span>
              )}
            </Link>
          ))}
        </div>

        {showNewPicker && (
          <Card className="mt-6">
            <h2 className="text-lg font-semibold text-zinc-900">Какой тип вопроса?</h2>
            <p className="mt-1 text-sm text-zinc-500">
              После выбора откроется форма с нужными полями.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NEW_TYPE_OPTIONS.map((o) => (
                <Link
                  key={o.type}
                  href={`/admin/checklist?new=${o.type}`}
                  className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-teal-400 hover:shadow-sm"
                >
                  <div className="text-sm font-semibold text-zinc-900">{o.label}</div>
                  <div className="mt-1 text-xs text-zinc-500">{o.hint}</div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {newType && <ChecklistQuestionForm mode={{ kind: "create", type: newType }} />}
        {editing && <ChecklistQuestionForm mode={{ kind: "edit", question: editing }} />}

        <div className="mt-6">
          {tab === "active" && (
            <ChecklistAdminList
              initial={allActive.map((q) => ({
                id: q.id,
                order: q.order,
                type: q.type,
                label: q.label,
                required: q.required,
                unit: q.unit,
                options: q.options,
                active: q.active,
              }))}
            />
          )}

          {tab === "hidden" && (
            <div className="space-y-3">
              {allHidden.length === 0 && (
                <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
                  Скрытых вопросов нет.
                </div>
              )}
              {allHidden.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{q.label}</div>
                    <div className="mt-1 text-xs text-zinc-500">скрыт</div>
                  </div>
                  <Link
                    href={`/admin/checklist?edit=${q.id}`}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Изменить
                  </Link>
                  <form action={setQuestionActiveAction}>
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="active" value="true" />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-50"
                    >
                      Показать
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {tab === "preview" && (
            <ChecklistPreview
              questions={allActive.map((q) => ({
                id: q.id,
                type: q.type,
                label: q.label,
                placeholder: q.placeholder,
                unit: q.unit,
                options: q.options,
                required: q.required,
              }))}
            />
          )}
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

- [ ] **Step 3:** Lint

```bash
npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 4:** Commit

```bash
git add src/app/admin/checklist/page.tsx
git commit -m "этап 6: страница /admin/checklist (3 таба, форма create/edit)"
```

---

## Task 9: Карточка «Чек-лист» на главной админа

**Files:**
- Modify: `src/app/admin/page.tsx` (добавить элемент в массив `SECTIONS`)

- [ ] **Step 1:** В `src/app/admin/page.tsx`, в массив `SECTIONS` добавить новый объект (после `"/admin/equipment-templates"`):

```tsx
  {
    href: "/admin/checklist",
    title: "Чек-лист",
    description: "Вопросы, которые сервисник заполняет на визите.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
```

- [ ] **Step 2:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit

```bash
git add src/app/admin/page.tsx
git commit -m "этап 6: ссылка на чек-лист на главной админа"
```

---

## Task 10: Финальная верификация

**Files:**
- (не модифицируем)

- [ ] **Step 1:** Type-check

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2:** Lint

```bash
npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 3:** Production build

```bash
npm run build
```

Expected: успешный билд без ошибок. В выводе должны появиться маршруты `/admin/checklist`.

- [ ] **Step 4:** Запустить dev-сервер для ручного смоук-теста

```bash
npm run dev
```

- [ ] **Step 5:** Ручной смоук-тест в браузере (`http://localhost:3000`):
  1. Залогиниться как админ.
  2. На `/admin` нажать карточку «Чек-лист» → попасть на `/admin/checklist`.
  3. Видим 25 активных вопросов из формы.
  4. Drag-drop: схватить любой вопрос за ручку `≡`, перетащить — порядок сохраняется (после refresh порядок прежний).
  5. Нажать «+ Добавить вопрос» → выбрать «Число» → форма открылась с полями label/placeholder/unit/required/обязательный.
  6. Заполнить «Уровень pH запас» / «мг/л» / required ✓ → «Добавить» → видим алерт «Вопрос добавлен», новый вопрос в конце списка.
  7. Перейти на вкладку «Превью» → видим все 26 вопросов с правильным рендером (число с единицей, single/multi/bool, текст).
  8. Скрыть один вопрос (кнопка «Скрыть») → исчезает из «Активных», появляется в «Скрытые». На вкладке «Превью» он не отображается.
  9. На вкладке «Скрытые» нажать «Показать» → возвращается в «Активные».
  10. Открыть «Изменить» у любого вопроса → правка label → «Сохранить» → label обновился.

- [ ] **Step 6:** Остановить dev-сервер. Если все пункты прошли — переходим к Task 11. Если что-то не работает — фиксим и повторяем.

---

## Task 11: Обновить `plan.md` и финальный коммит

**Files:**
- Modify: `plan.md`

- [ ] **Step 1:** В `plan.md` для этапа 6 проставить `[x]` всем подзадачам и обновить «Текущий статус» в самом низу.

Изменения в файле:

```diff
 ## Этап 6. Чек-лист (динамическая схема)

-- [ ] Prisma: `ChecklistQuestion` (порядок, тип, label, опции, флаг active)
-- [ ] Импорт вопросов из существующей Google-формы (один раз вручную: посмотреть форму, создать сидер)
-- [ ] Раздел `/admin/checklist` — список вопросов, drag-drop сортировка, добавление/редактирование/деактивация
-- [ ] Поддерживаемые типы: текст, число, селект, чекбокс/да-нет
-- [ ] Превью «как видит сервисник» в админке
+- [x] Prisma: `ChecklistQuestion` + enum `ChecklistQuestionType` (text/number/single_select/multi_select/bool). Миграция `20260508_checklist_init`.
+- [x] Сидер `prisma/seeds/checklist.ts` — 25 вопросов из Google-формы, идемпотентный.
+- [x] Раздел `/admin/checklist` — 3 таба (Активные / Скрытые / Превью), drag-drop через `@dnd-kit/sortable`, форма create/edit через URL-параметры.
+- [x] 5 типов вопросов: text, number (с unit), single_select, multi_select, bool.
+- [x] Превью «как видит сервисник» — переиспользуемый `ChecklistFieldRenderer` (для этапа 8).
+- [x] Activity log: `checklist.question.create/update/reorder/activate/deactivate`.
+- [x] Type-check, lint, `next build` чистые.
```

И внизу файла:

```diff
-**Текущий статус:** этап 5 реализован и ждёт приёмки юзером (2026-05-08). Следующий — этап 6 (Чек-лист). Этапы 6-17 — pending.
+**Текущий статус:** этап 6 реализован и ждёт приёмки юзером (2026-05-08). Следующий — этап 7 (Календарь и онлайн-запись). Этапы 7-17 — pending.
```

- [ ] **Step 2:** Final commit

```bash
git add plan.md
git commit -m "этап 6: чек-лист готов, ждёт приёмки юзером"
```

- [ ] **Step 3:** Сообщить юзеру:

> «Этап 6 готов. Открой http://localhost:3000/admin/checklist — посмотри 25 вопросов, попробуй drag-drop и добавление нового. Подтверди приёмку или укажи правки.»

---

## Self-review checklist (для исполнителя)

- [ ] Все 25 вопросов из формы засеяны (порядок 1–25, точные label, типы, units и options как в спеке).
- [ ] `multi_select` — только у вопроса «РАБОТА НАСОСНЫХ АГРЕГАТОВ».
- [ ] `bool` — только у «ПРОМЫВКА ФИЛЬТРА».
- [ ] Деактивированные вопросы не появляются в «Превью» и (после этапа 8) в форме визита.
- [ ] Drag-drop сохраняет порядок после refresh страницы (значит `reorderQuestions` отработал в БД).
- [ ] Правка label существующего вопроса не удаляет и не создаёт новый — `id` стабилен.
- [ ] Тип вопроса при редактировании не меняется (поле `type` приходит из БД, форма не позволяет его менять).
- [ ] Все server actions проверяют `session.user.role === "admin"` через `requireAdmin()`.
- [ ] В ActivityLog появились 5 типов событий после ручных операций.
- [ ] Маршрут `/admin/checklist` защищён через `proxy.ts` (наследуется от защиты `/admin/*` — отдельная правка не нужна).
