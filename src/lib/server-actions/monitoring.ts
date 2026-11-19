"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import {
  generateExternalId,
  generateToken,
  hashToken,
  tokenHint,
  webhookUrl,
} from "@/lib/monitoring/token";

export type ControllerCreds = {
  name: string;
  externalId: string;
  token: string;
  url: string;
};

export type ControllerFormState = {
  error?: string;
  creds?: ControllerCreds;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const ControllerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  customerId: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function parseForm(formData: FormData) {
  return ControllerSchema.safeParse({
    name: formData.get("name") ?? "",
    customerId: formData.get("customerId") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

async function resolveCustomerId(id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const c = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  return c?.id ?? null;
}

function back(params: Record<string, string>): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/admin/monitoring${search ? "?" + search : ""}`);
}

export async function createControllerAction(
  _prev: ControllerFormState,
  formData: FormData,
): Promise<ControllerFormState> {
  const actor = await requireAdmin();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: "Укажите название объекта" };

  const token = generateToken();
  const customerId = await resolveCustomerId(parsed.data.customerId);

  // externalId случайный; на случай совпадения — несколько попыток.
  let created = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const externalId = generateExternalId();
    const taken = await prisma.monitoringController.findUnique({
      where: { externalId },
      select: { id: true },
    });
    if (taken) continue;
    created = await prisma.monitoringController.create({
      data: {
        externalId,
        name: parsed.data.name,
        customerId,
        notes: parsed.data.notes ?? null,
        tokenHash: hashToken(token),
        tokenHint: tokenHint(token),
      },
    });
  }
  if (!created) return { error: "Не удалось создать контроллер, попробуйте ещё раз" };

  await logActivity({
    actorId: actor.id,
    action: "monitoring.controller.create",
    entityType: "MonitoringController",
    entityId: created.id,
    diff: { name: created.name, externalId: created.externalId, customerId },
  });

  revalidatePath("/admin/monitoring");
  revalidatePath("/service/monitoring");
  return {
    creds: { name: created.name, externalId: created.externalId, token, url: webhookUrl() },
  };
}

export async function regenerateTokenAction(
  _prev: ControllerFormState,
  formData: FormData,
): Promise<ControllerFormState> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const controller = id ? await prisma.monitoringController.findUnique({ where: { id } }) : null;
  if (!controller) return { error: "Контроллер не найден" };

  const token = generateToken();
  await prisma.monitoringController.update({
    where: { id },
    data: { tokenHash: hashToken(token), tokenHint: tokenHint(token) },
  });

  await logActivity({
    actorId: actor.id,
    action: "monitoring.controller.token_regenerated",
    entityType: "MonitoringController",
    entityId: id,
  });

  revalidatePath("/admin/monitoring");
  return {
    creds: { name: controller.name, externalId: controller.externalId, token, url: webhookUrl() },
  };
}

export async function updateControllerAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const before = id ? await prisma.monitoringController.findUnique({ where: { id } }) : null;
  if (!before) back({ error: "Контроллер не найден" });

  const parsed = parseForm(formData);
  if (!parsed.success) back({ edit: id, error: "Укажите название объекта" });

  const customerId = await resolveCustomerId(parsed.data.customerId);
  await prisma.monitoringController.update({
    where: { id },
    data: { name: parsed.data.name, customerId, notes: parsed.data.notes ?? null },
  });

  await logActivity({
    actorId: actor.id,
    action: "monitoring.controller.update",
    entityType: "MonitoringController",
    entityId: id,
    diff: {
      before: { name: before.name, customerId: before.customerId },
      after: { name: parsed.data.name, customerId },
    },
  });

  revalidatePath("/admin/monitoring");
  revalidatePath("/service/monitoring");
  back({ ok: "Сохранено" });
}

export async function setControllerActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const controller = id ? await prisma.monitoringController.findUnique({ where: { id } }) : null;
  if (!controller) back({ error: "Контроллер не найден" });

  await prisma.monitoringController.update({ where: { id }, data: { active } });

  await logActivity({
    actorId: actor.id,
    action: active ? "monitoring.controller.activate" : "monitoring.controller.deactivate",
    entityType: "MonitoringController",
    entityId: id,
  });

  revalidatePath("/admin/monitoring");
  revalidatePath("/service/monitoring");
  back({ ok: active ? "Контроллер включён" : "Контроллер отключён — сообщения от него не принимаются" });
}
