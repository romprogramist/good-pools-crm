"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { VisitStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush } from "@/lib/push/enqueue";

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
    include: {
      pool: { select: { name: true, customer: { select: { fullName: true } } } },
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

  const summary = `${new Date(visit.scheduledAt).toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })} — ${visit.pool.customer.fullName}, ${visit.pool.name}`;
  await enqueuePush(
    "visit_assigned",
    [{ userId: visit.serviceUserId }],
    { visitId: visit.id, summary },
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
