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

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return fallback;
}

function buildPayload(kind: PushKind, raw: Record<string, unknown>): PushPayload {
  switch (kind) {
    case "new_online_request":
      return {
        title: "Новая заявка",
        body: str(raw.preview, "Клиент записался на сервис"),
        url: `/service/online-requests/${str(raw.requestId)}`,
        tag: `req-${str(raw.requestId)}`,
      };
    case "request_accepted":
      return {
        title: "Заявка принята",
        body: `Визит ${str(raw.dateLabel, "назначен")}`,
        url: `/client/requests`,
        tag: `req-${str(raw.requestId)}`,
      };
    case "request_declined":
      return {
        title: "Заявка отклонена",
        body: str(raw.reason, "Сервисник отклонил заявку"),
        url: `/client/requests`,
        tag: `req-${str(raw.requestId)}`,
      };
    case "visit_assigned":
      return {
        title: "Назначен визит",
        body: str(raw.summary, "Новый визит в календаре"),
        url: `/service/visits/${str(raw.visitId)}`,
        tag: `visit-${str(raw.visitId)}`,
      };
    case "visit_report_ready":
      return {
        title: "Отчёт готов",
        body: `Сумма к оплате: ${str(raw.totalLabel, "—")}`,
        url: `/client/visits/${str(raw.visitId)}`,
        tag: `report-${str(raw.visitId)}`,
      };
    case "visit_report_updated":
      return {
        title: "Отчёт обновлён",
        body: str(raw.summary, "Сервисник обновил отчёт"),
        url: `/client/visits/${str(raw.visitId)}`,
        tag: `report-${str(raw.visitId)}`,
      };
    case "new_chat_message":
      return {
        title: "Новое сообщение",
        body: str(raw.preview, "Сообщение в поддержке"),
        url: `/${str(raw.scope, "client")}/support/${str(raw.threadId)}`,
        tag: `chat-${str(raw.threadId)}`,
      };
    case "equipment_warranty_expiring":
      return {
        title: "Заканчивается гарантия",
        body: `${str(raw.title, "Оборудование")} — ${str(raw.daysLeft, "14")} дн.`,
        url: str(raw.url, "/"),
        tag: `warranty-${str(raw.equipmentId)}`,
      };
    case "equipment_regulation_due":
      return {
        title: "Скоро регламент",
        body: `${str(raw.title, "Оборудование")} — через ${str(raw.daysLeft, "7")} дн.`,
        url: str(raw.url, "/"),
        tag: `regulation-${str(raw.equipmentId)}`,
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
