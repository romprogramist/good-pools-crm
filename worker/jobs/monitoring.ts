import { prisma } from "@/lib/prisma";
import { enqueuePush, listAdminAndServiceRecipients } from "@/lib/push/enqueue";
import { OFFLINE_AFTER_MS } from "@/lib/monitoring/view";
import { formatDateTime } from "@/lib/monitoring/format";
import type { JobResult } from "../run-job";

const RAW_MESSAGES_KEEP_DAYS = 90;

/**
 * Раз в 10 минут: контроллер, который перестал выходить на связь, сам об этом
 * не сообщит (нет света/интернета) — замечаем тишину и шлём пуш один раз.
 * Заодно чистим сырой журнал сообщений (показания и аварии хранятся отдельно и не удаляются).
 */
export async function monitoringJob(): Promise<JobResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - OFFLINE_AFTER_MS);

  const silent = await prisma.monitoringController.findMany({
    where: {
      active: true,
      expectHeartbeat: true,
      offlineNotifiedAt: null,
      lastSeenAt: { lt: cutoff },
    },
  });

  let sent = 0;
  let errors = 0;
  if (silent.length > 0) {
    const recipients = await listAdminAndServiceRecipients();
    for (const c of silent) {
      try {
        // Сначала отметка: при сбое пуша не будем слать повторно каждые 10 минут.
        await prisma.monitoringController.update({
          where: { id: c.id },
          data: { offlineNotifiedAt: now },
        });
        await enqueuePush("monitoring_offline", recipients, {
          controllerId: c.id,
          controllerName: c.name,
          since: c.lastSeenAt ? formatDateTime(c.lastSeenAt, now) : "",
        });
        sent += 1;
      } catch (err) {
        errors += 1;
        console.error("[cron] monitoring: offline notify failed", { controllerId: c.id, err });
      }
    }
  }

  const purged = await prisma.monitoringMessage.deleteMany({
    where: { receivedAt: { lt: new Date(now.getTime() - RAW_MESSAGES_KEEP_DAYS * 86_400_000) } },
  });

  return { processed: silent.length, sent, errors, deleted: purged.count };
}
