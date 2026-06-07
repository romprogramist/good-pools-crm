"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push/client-utils";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Props = {
  /** After success — update parent UI (e.g. reload /settings). */
  onSubscribed?: () => void;
  className?: string;
  label?: string;
};

export function SubscribeButton({ onSubscribed, className, label = "Разрешить уведомления" }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register the SW ahead of the click so the handler stays inside the user gesture on iOS/WebKit.
  useEffect(() => {
    if (!isPushSupported()) return;
    navigator.serviceWorker
      .register("/serwist/sw.js", { scope: "/" })
      .catch((e) => console.error("[push] SW register failed", e));
  }, []);

  async function handle() {
    setError(null);
    if (!isPushSupported()) { setError("Браузер не поддерживает уведомления"); return; }
    if (!PUBLIC_KEY) { setError("VAPID-ключ не настроен"); return; }

    setPending(true);
    try {
      // iOS/WebKit: requestPermission must run inside the user gesture, before any other await.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied" ? "Разрешение заблокировано в браузере" : "Разрешение не выдано");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) { setError(`Сервер вернул ${res.status}`); return; }
      onSubscribed?.();
    } catch (e) {
      console.error("[push] subscribe failed", e);
      const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setError(`Не удалось подписаться (${detail})`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button onClick={handle} disabled={pending}>
        {pending ? "Подключаем…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
