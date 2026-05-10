import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PushKind =
  | "new_online_request"
  | "request_accepted"
  | "request_declined"
  | "visit_assigned"
  | "visit_report_ready"
  | "visit_report_updated";

export type PushRecipient = { userId: string };

/**
 * Заглушка пуш-уведомлений на этап 7.
 * Этап 12 заменит реализацию на реальный Web Push — точки вызова не меняются.
 */
export async function enqueuePush(
  kind: PushKind,
  recipients: PushRecipient[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipients.length === 0) return;
  const data = recipients.map((r) => ({
    actorId: null,
    action: `push.queued.${kind}`,
    entityType: "User",
    entityId: r.userId,
    diff: payload as Prisma.InputJsonValue,
  }));
  await prisma.activityLog.createMany({ data });
  for (const r of recipients) {
    console.log(`[push-stub] ${kind} → user ${r.userId}`, payload);
  }
}

/** Все активные admin+service для push — кому уходит 'new_online_request' и 'visit_assigned'. */
export async function listAdminAndServiceRecipients(): Promise<PushRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    select: { id: true },
  });
  return users.map((u) => ({ userId: u.id }));
}

/** Получить userId владельца Customer (для push-уведомлений клиенту). */
export async function getCustomerUserId(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  return c?.userId ?? null;
}
