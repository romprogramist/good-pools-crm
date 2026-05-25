import { prisma } from "@/lib/prisma";

export type PushRecipient = { userId: string };

/** Все активные admin+service. */
export async function listAdminAndServiceRecipients(): Promise<PushRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    select: { id: true },
  });
  return users.map((u) => ({ userId: u.id }));
}

/** userId владельца Customer (для push клиенту). */
export async function getCustomerUserId(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  return c?.userId ?? null;
}
