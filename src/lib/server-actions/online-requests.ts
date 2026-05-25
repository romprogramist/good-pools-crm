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
} from "@/lib/push/enqueue";
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
    const dateLabel = new Date(result.visit.scheduledAt).toLocaleString("ru-RU", {
      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
    await enqueuePush(
      "request_accepted",
      [{ userId: clientUserId }],
      {
        requestId: result.request.id,
        dateLabel,
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
