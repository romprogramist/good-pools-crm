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
