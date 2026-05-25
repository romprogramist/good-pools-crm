self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const options = {
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
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
