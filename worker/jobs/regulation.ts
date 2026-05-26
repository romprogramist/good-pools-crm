import { prisma } from "@/lib/prisma";
import { sendRegulationReminder } from "@/lib/push/equipment";
import type { JobResult } from "../run-job";
import { addDays, daysBetween, startOfDay } from "../date-utils";

const REGULATION_HORIZON_DAYS = 7;

export async function regulationJob(): Promise<JobResult> {
  const today = startOfDay(new Date());
  const horizon = addDays(today, REGULATION_HORIZON_DAYS);

  const candidates = await prisma.equipment.findMany({
    where: { regulationNotifiedAt: null, regulationPeriodDays: { gt: 0 } },
    select: {
      id: true,
      installDate: true,
      regulationPeriodDays: true,
      lastReplacementDate: true,
    },
  });

  let processed = 0;
  let sent = 0;
  let errors = 0;

  for (const eq of candidates) {
    processed += 1;
    const base = eq.lastReplacementDate ?? eq.installDate;
    const dueAt = addDays(base, eq.regulationPeriodDays);
    if (dueAt < today || dueAt > horizon) continue;

    const daysLeft = Math.max(0, daysBetween(today, dueAt));
    try {
      await sendRegulationReminder(eq.id, daysLeft);
      await prisma.equipment.update({
        where: { id: eq.id },
        data: { regulationNotifiedAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      errors += 1;
      console.error("[cron] regulation: send failed", { equipmentId: eq.id, err });
    }
  }

  return { processed, sent, errors };
}
