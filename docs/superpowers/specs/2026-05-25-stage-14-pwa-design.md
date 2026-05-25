# Этап 14. PWA — дизайн

**Дата:** 2026-05-25
**Статус:** утверждено пользователем.
**Связано:** `plan.md` этап 14, `2026-05-25-stage-12-web-push-design.md` (push SW).

## Цель

Превратить CRM в installable PWA: иконка на домашнем экране (iOS/Android), запуск в standalone-режиме без браузерной шапки, базовый offline-fallback. Не ломая push-уведомления из этапа 12.

## Архитектура service worker

Установить `serwist`, `@serwist/next`, `@serwist/turbopack`. Next 16 работает на Turbopack — нативный путь Serwist для этой версии — через **route handler**, а не через `withSerwist` config-wrapper.

**`src/app/sw.js/route.ts`** — route handler:

```ts
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  additionalPrecacheEntries: [{ url: "/offline.html", revision }],
  useNativeEsbuild: true,
});
```

**`src/app/sw.ts`** — единый SW:

```ts
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: any[] };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    const match = await serwist.matchPrecache("/offline.html");
    return match || Response.error();
  }
  return Response.error();
});

serwist.addEventListeners();

// --- Push handlers, перенесены 1-в-1 из public/sw.js (этап 12) ---
self.addEventListener("push", (event) => { /* ... */ });
self.addEventListener("notificationclick", (event) => { /* ... */ });
```

**Старый `public/sw.js` удаляется.** Регистрация `navigator.serviceWorker.register("/sw.js")` в `SubscribeButton.tsx` и `SubscribeBanner.tsx` остаётся без изменений — путь тот же, теперь обслуживается через route handler.

В `src/proxy.ts` `/sw.js` остаётся в `PUBLIC_PATHS`.

## Манифест

`src/app/manifest.ts` — Next.js built-in metadata route, отдаёт `/manifest.webmanifest`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Хорошие Бассейны — CRM",
    short_name: "ХБ CRM",
    lang: "ru",
    description: "Система обслуживания бассейнов",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0d9488",
    background_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

В `src/app/layout.tsx` дополнить `metadata`:

```ts
manifest: "/manifest.webmanifest",
themeColor: "#0d9488",
appleWebApp: { capable: true, statusBarStyle: "default", title: "ХБ CRM" },
icons: {
  icon: "/icon-192.png",
  apple: "/icon-192.png",
},
```

## Иконки

Скрипт `scripts/generate-pwa-icons.ts` — заменяет `generate-placeholder-icons.ts` (старый удаляется, его npm-скрипт тоже). Через `sharp`:

1. Композирует SVG: фон `linear-gradient(135deg, teal-500 #14b8a6 → cyan-600 #0891b2)`, поверх белая `<path>`-«лесенка-пловец» из `Header.tsx` (тот же `viewBox 0 0 24 24`, центрированный, scale 60%).
2. Рендерит в `public/icon-192.png` (192x192) и `public/icon-512.png` (512x512).
3. Рендерит `public/icon-512-maskable.png` — тот же SVG, но содержимое масштабировано до 80% (safe-zone для Android adaptive).

`badge-72.png` остаётся как есть (используется push-уведомлениями).

`package.json` scripts: `"icons:pwa": "tsx scripts/generate-pwa-icons.ts"`.

Скрипт запускается **один раз вручную** при изменении лого, файлы коммитятся в git.

## Offline-fallback

**Статический файл `public/offline.html`** — не App Router route, чтобы не зависеть от React/гидрации/CSS-чанков (в offline их может не быть):

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Нет подключения — ХБ CRM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #111; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 360px; text-align: center; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p  { color: #71717a; margin: 0 0 24px; }
    button { background: #0d9488; color: #fff; border: 0; border-radius: 10px; padding: 12px 20px; font-size: 15px; font-weight: 500; cursor: pointer; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Нет подключения</h1>
    <p>Проверьте интернет и обновите страницу.</p>
    <button onclick="location.reload()">Обновить</button>
  </main>
</body>
</html>
```

Прекешится через `additionalPrecacheEntries: [{ url: "/offline.html", revision }]` в route handler. Catch-handler возвращает её для `request.destination === "document"`.

Файлы в `public/` отдаются Next напрямую — без бандлеров, без HTML-обёртки от App Router. Это критично для offline.

## iOS Add-to-Home + splash

Через `metadata.appleWebApp` в `layout.tsx` (см. раздел «Манифест»). Этого достаточно для базовой установки.

Splash-screen для iOS требует отдельные `<link rel="apple-touch-startup-image" media="..." />` под каждый размер экрана (~12 штук). **Принято решение**: одна универсальная splash не нужна — iOS будет показывать дефолтный белый экран с иконкой (это OK, потому что `background_color: "#ffffff"`). Полный комплект splash добавим только если клиент попросит.

## Регистрация SW

Сейчас SW регистрируется в `SubscribeButton.tsx` (по клику пользователя) и в `SubscribeBanner.tsx` (после accept на баннере). Это значит, что у юзера, который не подписался на push, **нет** активного SW → нет precache, нет offline-fallback.

Добавить `src/components/PwaRegister.tsx` — client component:

```tsx
"use client";
import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }, []);
  return null;
}
```

Вставить в `src/app/layout.tsx` рядом с `<Header />` (в `<body>`). Idempotent через `getRegistration` — не дублирует существующую регистрацию от push-баннера.

## Зависимости

```
serwist
@serwist/next
@serwist/turbopack
```

Версии — последние стабильные, поддерживающие Next 16 (≥10.x).

## Тестирование

- `tsc --noEmit` без ошибок.
- `next build` — должен сгенерировать манифест, route `/sw.js`, прекеш-манифест (`self.__SW_MANIFEST` инжектится Serwist'ом во время билда).
- Chrome DevTools → Application:
  - Manifest: все поля заполнены, иконки видны.
  - Service Workers: `/sw.js` активен, source — Serwist precache + push handlers.
  - Cache Storage: `serwist-precache-*` содержит chunks + `/~offline`.
- Offline-режим в DevTools → перезагрузить любую страницу → отдаётся `/~offline` с кнопкой «Обновить».
- Lighthouse PWA: target ≥90.

## Чекпойнт (без изменений против plan.md)

Юзер открывает CRM на iPhone в Safari → «Поделиться» → «На экран Домой» → иконка появляется → запуск открывает приложение в полноэкранном режиме без браузерной шапки.

## Out of scope

- **Push outbox / надёжная доставка** — этап 15 (cron + queue drain).
- **Background sync** для офлайн-завершения визитов — отдельный беклог.
- **Полный комплект iOS splash-screens** — по запросу клиента.
- **Update-prompt** («доступна новая версия, обновить?») — Serwist умеет, но не критично для MVP, добавим позже.
