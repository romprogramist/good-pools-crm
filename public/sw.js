self.addEventListener("install", () => { console.log("[SW] install"); self.skipWaiting(); });
self.addEventListener("activate", (e) => { console.log("[SW] activate"); e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  console.log("[SW] push event received, hasData=", !!event.data);
  if (!event.data) { console.warn("[SW] no data, abort"); return; }
  let payload;
  try { payload = event.data.json(); console.log("[SW] payload=", payload); }
  catch (e) { console.error("[SW] JSON parse failed", e); return; }
  const options = {
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: false,
  };
  event.waitUntil(
    self.registration.showNotification(payload.title, options)
      .then(() => console.log("[SW] showNotification OK"))
      .catch((err) => console.error("[SW] showNotification failed", err))
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] notificationclick");
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = new URL(url, self.location.origin);
    const existing = all.find((c) => new URL(c.url).pathname === target.pathname);
    if (existing) { await existing.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
