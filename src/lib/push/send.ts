import { prisma } from "@/lib/prisma";
import webpush, { WebPushError } from "web-push";
import { pushConfigured } from "./web-push";

const PUSH_TTL_SECONDS = 60 * 60 * 24; // push services retain the notification up to 24h if device is offline
const DEBUG_PUSH = process.env.DEBUG_PUSH === "1";
const debug: typeof console.log = DEBUG_PUSH ? console.log.bind(console) : () => {};

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
  debug("[push] sendPush start", { userId, subs: subs.length, kind: payload.tag ?? "?" });
  if (subs.length === 0) return 0;

  const json = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      const host = (() => { try { return new URL(s.endpoint).host; } catch { return "?"; } })();
      const t0 = Date.now();
      try {
        const result = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: PUSH_TTL_SECONDS },
        );
        debug("[push] OK", { host, status: result.statusCode, ms: Date.now() - t0 });
        delivered += 1;
        try {
          await prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastUsedAt: new Date() },
          });
        } catch (err) {
          console.error("[push] lastUsedAt update failed", { endpoint: s.endpoint, err });
        }
      } catch (err: unknown) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          debug("[push] DEAD", { host, status: err.statusCode, ms: Date.now() - t0 });
          deadEndpoints.push(s.endpoint);
        } else {
          const status = err instanceof WebPushError ? err.statusCode : undefined;
          console.error("[push] FAIL", { host, status, ms: Date.now() - t0, err });
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } });
    debug("[push] удалено мёртвых подписок:", deadEndpoints.length);
  }

  return delivered;
}
