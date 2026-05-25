/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { NavigationRoute, NetworkOnly, Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const OFFLINE_CACHE = "offline-fallback-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

serwist.registerRoute(new NavigationRoute(new NetworkOnly()));

serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    const cache = await caches.open(OFFLINE_CACHE);
    const match = await cache.match(OFFLINE_URL);
    return match || Response.error();
  }
  return Response.error();
});

serwist.addEventListeners();

// === Push handlers, перенесены 1-в-1 из public/sw.js (этап 12) ===

self.addEventListener("push", (event) => {
  console.log("[SW] push event received, hasData=", !!event.data);
  if (!event.data) {
    console.warn("[SW] no data, abort");
    return;
  }
  let payload: { title: string; body: string; icon?: string; tag?: string; url?: string };
  try {
    payload = event.data.json();
    console.log("[SW] payload=", payload);
  } catch (e) {
    console.error("[SW] JSON parse failed", e);
    return;
  }
  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: false,
  };
  event.waitUntil(
    self.registration
      .showNotification(payload.title, options)
      .then(() => console.log("[SW] showNotification OK"))
      .catch((err) => console.error("[SW] showNotification failed", err)),
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] notificationclick");
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin);
      const existing = all.find((c) => new URL(c.url).pathname === target.pathname);
      if (existing) {
        await (existing as WindowClient).focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
