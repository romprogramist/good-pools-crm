"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendTestPushAction } from "@/lib/server-actions/push";

export function TestPushButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setMsg(null);
    try {
      const { sentTo } = await sendTestPushAction();
      setMsg(sentTo === 0 ? "Нет активных подписок (включи уведомления выше)" : `Пуш отправлен на ${sentTo} устройств(а)`);
    } catch {
      setMsg("Ошибка — проверь логи сервера (возможно, VAPID не настроен)");
    }
  }

  return (
    <div>
      <Button onClick={() => startTransition(handle)} disabled={pending}>
        {pending ? "Отправляем…" : "Отправить себе тестовый пуш"}
      </Button>
      {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
    </div>
  );
}
