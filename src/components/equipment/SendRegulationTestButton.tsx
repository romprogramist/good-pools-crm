"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendRegulationReminderTestAction } from "@/lib/server-actions/push";

export function SendRegulationTestButton({ equipmentId }: { equipmentId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setMsg(null);
    try {
      await sendRegulationReminderTestAction(equipmentId);
      setMsg("Пуш отправлен клиенту и сервисникам (проверь ActivityLog)");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div>
      <Button onClick={() => startTransition(handle)} disabled={pending} variant="outline" size="sm">
        {pending ? "Отправляем…" : "Тест: пуш о регламенте"}
      </Button>
      {msg && <p className="mt-1 text-xs text-zinc-600">{msg}</p>}
    </div>
  );
}
