"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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

const TemplateSchema = z.object({
  typeName: z.string().trim().min(1, "Название обязательно").max(120),
  defaultWarrantyMonths: z.coerce.number().int().min(0).max(600),
  regulationPeriodDays: z.coerce.number().int().min(0).max(3650),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function back(params: Record<string, string>): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/admin/equipment-templates${search ? "?" + search : ""}`);
}

export async function createTemplateAction(formData: FormData) {
  const actor = await requireAdmin();

  const parsed = TemplateSchema.safeParse({
    typeName: formData.get("typeName"),
    defaultWarrantyMonths: formData.get("defaultWarrantyMonths"),
    regulationPeriodDays: formData.get("regulationPeriodDays"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    back({ error: encodeURIComponent("Проверьте поля формы") });
  }

  const tpl = await prisma.equipmentTemplate.create({
    data: {
      typeName: parsed.data.typeName,
      defaultWarrantyMonths: parsed.data.defaultWarrantyMonths,
      regulationPeriodDays: parsed.data.regulationPeriodDays,
      notes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "equipmentTemplate.create",
    entityType: "EquipmentTemplate",
    entityId: tpl.id,
    diff: {
      typeName: tpl.typeName,
      defaultWarrantyMonths: tpl.defaultWarrantyMonths,
      regulationPeriodDays: tpl.regulationPeriodDays,
    },
  });

  revalidatePath("/admin/equipment-templates");
  back({ ok: encodeURIComponent("Шаблон создан") });
}

export async function updateTemplateAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) back({ error: encodeURIComponent("Не указан шаблон") });

  const before = await prisma.equipmentTemplate.findUnique({ where: { id } });
  if (!before) back({ error: encodeURIComponent("Шаблон не найден") });

  const parsed = TemplateSchema.safeParse({
    typeName: formData.get("typeName"),
    defaultWarrantyMonths: formData.get("defaultWarrantyMonths"),
    regulationPeriodDays: formData.get("regulationPeriodDays"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    back({ error: encodeURIComponent("Проверьте поля формы") });
  }

  await prisma.equipmentTemplate.update({
    where: { id },
    data: {
      typeName: parsed.data.typeName,
      defaultWarrantyMonths: parsed.data.defaultWarrantyMonths,
      regulationPeriodDays: parsed.data.regulationPeriodDays,
      notes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "equipmentTemplate.update",
    entityType: "EquipmentTemplate",
    entityId: id,
    diff: {
      before: {
        typeName: before.typeName,
        defaultWarrantyMonths: before.defaultWarrantyMonths,
        regulationPeriodDays: before.regulationPeriodDays,
      },
      after: {
        typeName: parsed.data.typeName,
        defaultWarrantyMonths: parsed.data.defaultWarrantyMonths,
        regulationPeriodDays: parsed.data.regulationPeriodDays,
      },
    },
  });

  revalidatePath("/admin/equipment-templates");
  back({ ok: encodeURIComponent("Сохранено") });
}

export async function setTemplateActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) back({ error: encodeURIComponent("Не указан шаблон") });

  const tpl = await prisma.equipmentTemplate.findUnique({ where: { id } });
  if (!tpl) back({ error: encodeURIComponent("Шаблон не найден") });

  await prisma.equipmentTemplate.update({ where: { id }, data: { active } });

  await logActivity({
    actorId: actor.id,
    action: active ? "equipmentTemplate.activate" : "equipmentTemplate.deactivate",
    entityType: "EquipmentTemplate",
    entityId: id,
  });

  revalidatePath("/admin/equipment-templates");
  back({
    ok: encodeURIComponent(active ? "Шаблон активирован" : "Шаблон деактивирован"),
  });
}
