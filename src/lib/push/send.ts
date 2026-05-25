import { prisma } from "@/lib/prisma";
import { webpush, pushConfigured } from "./web-push";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured) {
    console.warn("[push] VAPID не настроен, sendPush no-op", { userId, payload });
    return 0;
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const json = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 60 * 60 * 24 },
        );
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastUsedAt: new Date() },
        });
        delivered += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          console.error("[push] sendNotification failed", { endpoint: s.endpoint, status, err });
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } });
    console.log("[push] удалено мёртвых подписок:", deadEndpoints.length);
  }

  return delivered;
}
