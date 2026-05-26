"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Scope = "admin" | "service";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const CreateSchema = z.object({
  templateId: z.string().trim().min(1, "Выберите шаблон"),
  installDate: z.string().trim().min(1, "Укажите дату установки"),
  serial: z.string().trim().max(120).optional().or(z.literal("")),
  warrantyMonths: z.string().trim().optional().or(z.literal("")),
  regulationPeriodDays: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const UpdateSchema = z.object({
  installDate: z.string().trim().min(1, "Укажите дату установки"),
  serial: z.string().trim().max(120).optional().or(z.literal("")),
  warrantyMonths: z.coerce.number().int().min(0).max(600),
  regulationPeriodDays: z.coerce.number().int().min(0).max(3650),
  lastReplacementDate: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function backToPool(
  scope: Scope,
  customerId: string,
  poolId: string,
  params: Record<string, string>,
): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/${scope}/customers/${customerId}/pools/${poolId}${search ? "?" + search : ""}`);
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseInt0(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function addEquipmentAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");

  if (!customerId || !poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Не указан бассейн"),
    });
  }

  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.customerId !== customerId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Бассейн не найден"),
    });
  }

  const parsed = CreateSchema.safeParse({
    templateId: formData.get("templateId"),
    installDate: formData.get("installDate"),
    serial: formData.get("serial"),
    warrantyMonths: formData.get("warrantyMonths"),
    regulationPeriodDays: formData.get("regulationPeriodDays"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Проверьте поля формы"),
    });
  }

  const tpl = await prisma.equipmentTemplate.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!tpl || !tpl.active) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Шаблон оборудования не найден"),
    });
  }

  const installDate = parseDate(parsed.data.installDate);
  if (!installDate) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Некорректная дата установки"),
    });
  }

  const warrantyMonths = parseInt0(parsed.data.warrantyMonths, tpl.defaultWarrantyMonths);
  const regulationPeriodDays = parseInt0(
    parsed.data.regulationPeriodDays,
    tpl.regulationPeriodDays,
  );

  const equipment = await prisma.equipment.create({
    data: {
      poolId,
      templateId: tpl.id,
      typeName: tpl.typeName,
      serial: parsed.data.serial || null,
      installDate,
      warrantyMonths,
      regulationPeriodDays,
      notes: parsed.data.notes || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "equipment.create",
    entityType: "Equipment",
    entityId: equipment.id,
    diff: {
      poolId,
      templateId: tpl.id,
      typeName: tpl.typeName,
      installDate: installDate.toISOString(),
      warrantyMonths,
      regulationPeriodDays,
    },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, {
    ok: encodeURIComponent("Оборудование добавлено"),
  });
}

export async function updateEquipmentAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  const before = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!before || before.poolId !== poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Оборудование не найдено"),
    });
  }

  const parsed = UpdateSchema.safeParse({
    installDate: formData.get("installDate"),
    serial: formData.get("serial"),
    warrantyMonths: formData.get("warrantyMonths"),
    regulationPeriodDays: formData.get("regulationPeriodDays"),
    lastReplacementDate: formData.get("lastReplacementDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Проверьте поля формы"),
    });
  }

  const installDate = parseDate(parsed.data.installDate);
  if (!installDate) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Некорректная дата установки"),
    });
  }

  const lastReplacementDate = parsed.data.lastReplacementDate
    ? parseDate(parsed.data.lastReplacementDate)
    : null;

  const warrantyChanged =
    before.installDate.getTime() !== installDate.getTime() ||
    before.warrantyMonths !== parsed.data.warrantyMonths;
  const regulationChanged =
    (before.lastReplacementDate?.getTime() ?? null) !==
      (lastReplacementDate?.getTime() ?? null) ||
    before.regulationPeriodDays !== parsed.data.regulationPeriodDays;

  await prisma.equipment.update({
    where: { id: equipmentId },
    data: {
      installDate,
      serial: parsed.data.serial || null,
      warrantyMonths: parsed.data.warrantyMonths,
      regulationPeriodDays: parsed.data.regulationPeriodDays,
      lastReplacementDate,
      notes: parsed.data.notes || null,
      ...(warrantyChanged ? { warrantyNotifiedAt: null } : {}),
      ...(regulationChanged ? { regulationNotifiedAt: null } : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "equipment.update",
    entityType: "Equipment",
    entityId: equipmentId,
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, { ok: encodeURIComponent("Сохранено") });
}

export async function markReplacedTodayAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!eq || eq.poolId !== poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Оборудование не найдено"),
    });
  }

  const now = new Date();
  await prisma.equipment.update({
    where: { id: equipmentId },
    data: { lastReplacementDate: now, regulationNotifiedAt: null },
  });

  await logActivity({
    actorId: actor.id,
    action: "equipment.replaced",
    entityType: "Equipment",
    entityId: equipmentId,
    diff: { at: now.toISOString() },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, {
    ok: encodeURIComponent("Отмечена замена"),
  });
}

export async function deleteEquipmentAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!eq || eq.poolId !== poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Оборудование не найдено"),
    });
  }

  await prisma.equipment.delete({ where: { id: equipmentId } });

  await logActivity({
    actorId: actor.id,
    action: "equipment.delete",
    entityType: "Equipment",
    entityId: equipmentId,
    diff: { typeName: eq.typeName, poolId },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, {
    ok: encodeURIComponent("Оборудование удалено"),
  });
}
