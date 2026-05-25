"use client";

import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    if (!isPushSupported()) { setError("Браузер не поддерживает уведомления"); return; }
    if (!PUBLIC_KEY) { setError("VAPID-ключ не настроен"); return; }

    try {
      const reg = await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied" ? "Разрешение заблокировано в браузере" : "Разрешение не выдано");
        return;
      }
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
      setError("Не удалось подписаться");
    }
  }

  return (
    <div className={className}>
      <Button onClick={() => startTransition(handle)} disabled={pending}>
        {pending ? "Подключаем…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
