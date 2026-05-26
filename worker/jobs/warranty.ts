import { prisma } from "@/lib/prisma";
import { sendWarrantyReminder } from "@/lib/push/equipment";
import type { JobResult } from "../run-job";
import { addDays, addMonths, daysBetween, startOfDay } from "../date-utils";

const WARRANTY_HORIZON_DAYS = 14;

export async function warrantyJob(): Promise<JobResult> {
  const today = startOfDay(new Date());
  const horizon = addDays(today, WARRANTY_HORIZON_DAYS);

  const candidates = await prisma.equipment.findMany({
    where: { warrantyNotifiedAt: null, warrantyMonths: { gt: 0 } },
    select: { id: true, installDate: true, warrantyMonths: true },
  });

  let processed = 0;
  let sent = 0;
  let errors = 0;

  for (const eq of candidates) {
    processed += 1;
    const warrantyEnd = addMonths(eq.installDate, eq.warrantyMonths);
    if (warrantyEnd < today || warrantyEnd > horizon) continue;

    const daysLeft = Math.max(0, daysBetween(today, warrantyEnd));
    try {
      await sendWarrantyReminder(eq.id, daysLeft);
      await prisma.equipment.update({
        where: { id: eq.id },
        data: { warrantyNotifiedAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      errors += 1;
      console.error("[cron] warranty: send failed", { equipmentId: eq.id, err });
    }
  }

  return { processed, sent, errors };
}
