"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push/client-utils";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Props = {
  /** After success — update parent UI (e.g. reload /settings). */
  onSubscribed?: () => void;
  className?: string;
  label?: string;
};

/** Reject if `p` doesn't settle within `ms`, so the UI never hangs silently (iOS likes to hang). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`таймаут на шаге «${label}»`)), ms),
    ),
  ]);
}

/**
 * Get a registration whose worker is actually `activated`.
 * On iOS `navigator.serviceWorker.ready` can hang forever on first PWA launch,
 * so we wait on the worker's statechange explicitly instead.
 */
async function getActiveRegistration(timeoutMs: number): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
  if (reg.active) return reg;

  const worker = reg.installing ?? reg.waiting;
  if (!worker) {
    return withTimeout(navigator.serviceWorker.ready, timeoutMs, "активация SW");
  }

  await withTimeout(
    new Promise<void>((resolve) => {
      const check = () => { if (worker.state === "activated") resolve(); };
      check();
      worker.addEventListener("statechange", check);
    }),
    timeoutMs,
    "активация SW",
  );
  return reg;
}

export function SubscribeButton({ onSubscribed, className, label = "Разрешить уведомления" }: Props) {
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const regRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);

  // Kick off SW registration ahead of the click so it has time to activate.
  useEffect(() => {
    if (!isPushSupported()) return;
    regRef.current = navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
    regRef.current.catch((e) => console.error("[push] SW register failed", e));
  }, []);

  async function handle() {
    setError(null);
    if (!isPushSupported()) { setError("Браузер не поддерживает уведомления"); return; }
    if (!PUBLIC_KEY) { setError("VAPID-ключ не настроен"); return; }

    setPending(true);
    try {
      // iOS/WebKit: requestPermission must run inside the user gesture, before any other await.
      setStep("Запрос разрешения…");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied" ? "Разрешение заблокировано в браузере" : "Разрешение не выдано");
        return;
      }

      setStep("Активация SW…");
      const reg = await getActiveRegistration(12_000);

      setStep("Подписка…");
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
          }),
          20_000,
          "подписка push",
        ));

      setStep("Сохранение…");
      const res = await withTimeout(
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
        }),
        15_000,
        "сохранение на сервере",
      );
      if (!res.ok) { setError(`Сервер вернул ${res.status}`); return; }
      onSubscribed?.();
    } catch (e) {
      console.error("[push] subscribe failed", e);
      const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setError(`Не удалось подписаться (${detail})`);
    } finally {
      setPending(false);
      setStep(null);
    }
  }

  return (
    <div className={className}>
      <Button onClick={handle} disabled={pending}>
        {pending ? (step ?? "Подключаем…") : label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
