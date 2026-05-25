"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush } from "@/lib/push/enqueue";
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

  const pool = await prisma.pool.findUnique({
    where: { id: parsed.data.poolId },
    include: { customer: { select: { fullName: true } } },
  });
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

  const summary = `${new Date(series.startAt).toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })} — ${pool.customer.fullName}, ${pool.name}`;
  await enqueuePush(
    "visit_assigned",
    [{ userId: series.serviceUserId }],
    { seriesId: series.id, count: series.occurrences, summary },
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
