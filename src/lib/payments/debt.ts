import { prisma } from "@/lib/prisma";

/**
 * Сумма долга клиента — все завершённые визиты со статусом оплаты unpaid.
 * Используется в форме онлайн-заявки (блокировка) и в реестре клиентов.
 */
export async function getCustomerDebt(customerId: string): Promise<number> {
  const rows = await prisma.visit.findMany({
    where: {
      pool: { customerId },
      status: "completed",
      paymentStatus: "unpaid",
    },
    select: { totalAmount: true },
  });
  const sum = rows.reduce((s, v) => s + Number(v.totalAmount ?? 0), 0);
  return Math.round(sum * 100) / 100;
}

export async function hasUnpaidDebt(customerId: string): Promise<boolean> {
  return (await getCustomerDebt(customerId)) > 0;
}
