import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPush, type PushPayload } from "./send";
import type { PushRecipient } from "./recipients";

export { listAdminAndServiceRecipients, getCustomerUserId } from "./recipients";
export type { PushRecipient };

export type PushKind =
  | "new_online_request"
  | "request_accepted"
  | "request_declined"
  | "visit_assigned"
  | "visit_report_ready"
  | "visit_report_updated"
  | "new_chat_message"
  | "equipment_warranty_expiring"
  | "equipment_regulation_due";

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function buildPayload(kind: PushKind, raw: Record<string, unknown>): PushPayload {
  switch (kind) {
    case "new_online_request":
      return {
        title: "Новая заявка",
        body: s(raw.preview, "Клиент записался на сервис"),
        url: `/service/online-requests/${s(raw.requestId)}`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "request_accepted":
      return {
        title: "Заявка принята",
        body: `Визит ${s(raw.dateLabel, "назначен")}`,
        url: `/client/requests`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "request_declined":
      return {
        title: "Заявка отклонена",
        body: s(raw.reason, "Сервисник отклонил заявку"),
        url: `/client/requests`,
        tag: `req-${s(raw.requestId)}`,
      };
    case "visit_assigned":
      return {
        title: "Назначен визит",
        body: s(raw.summary, "Новый визит в календаре"),
        url: `/service/visits/${s(raw.visitId)}`,
        tag: `visit-${s(raw.visitId)}`,
      };
    case "visit_report_ready":
      return {
        title: "Отчёт готов",
        body: `Сумма к оплате: ${s(raw.totalLabel, "—")}`,
        url: `/client/visits/${s(raw.visitId)}`,
        tag: `report-${s(raw.visitId)}`,
      };
    case "visit_report_updated":
      return {
        title: "Отчёт обновлён",
        body: s(raw.summary, "Сервисник обновил отчёт"),
        url: `/client/visits/${s(raw.visitId)}`,
        tag: `report-${s(raw.visitId)}`,
      };
    case "new_chat_message":
      return {
        title: "Новое сообщение",
        body: s(raw.preview, "Сообщение в поддержке"),
        url: `/${s(raw.scope, "client")}/support/${s(raw.threadId)}`,
        tag: `chat-${s(raw.threadId)}`,
      };
    case "equipment_warranty_expiring":
      return {
        title: "Заканчивается гарантия",
        body: `${s(raw.title, "Оборудование")} — ${s(raw.daysLeft, "14")} дн.`,
        url: s(raw.url, "/"),
        tag: `warranty-${s(raw.equipmentId)}`,
      };
    case "equipment_regulation_due":
      return {
        title: "Скоро регламент",
        body: `${s(raw.title, "Оборудование")} — через ${s(raw.daysLeft, "7")} дн.`,
        url: s(raw.url, "/"),
        tag: `regulation-${s(raw.equipmentId)}`,
      };
  }
}

export async function enqueuePush(
  kind: PushKind,
  recipients: PushRecipient[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipients.length === 0) return;

  // 1. Синхронно — ActivityLog. server action ответит клиенту сразу после этого.
  await prisma.activityLog.createMany({
    data: recipients.map((r) => ({
      actorId: null,
      action: `push.queued.${kind}`,
      entityType: "User",
      entityId: r.userId,
      diff: payload as Prisma.InputJsonValue,
    })),
  });

  // 2. Fire-and-forget — реальная отправка. .catch чтобы unhandled rejection не валил Node.
  const browserPayload = buildPayload(kind, payload);
  for (const r of recipients) {
    void sendPush(r.userId, browserPayload).catch((err) => {
      console.error("[push] sendPush failed", { userId: r.userId, kind, err });
    });
  }
}
