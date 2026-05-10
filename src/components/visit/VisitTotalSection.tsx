"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { saveTotalAmountAction } from "@/lib/server-actions/visit-report";

export function VisitTotalSection({
  visitId,
  initialAmount,
  hint,
  disabled = false,
  onAmountChange,
}: {
  visitId: string;
  initialAmount: string | null;
  hint: number;
  disabled?: boolean;
  onAmountChange?: (amount: number | null) => void;
}) {
  const [value, setValue] = useState(initialAmount ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commit() {
    if (value.trim() === "") {
      onAmountChange?.(null);
      return;
    }
    const amount = Number(value.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      setError("Введите число ≥ 0");
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    startTransition(async () => {
      const result = await saveTotalAmountAction({ visitId, amount });
      if (result.ok) {
        setState("saved");
        onAmountChange?.(amount);
        setTimeout(() => setState("idle"), 1500);
      } else {
        setState("error");
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Сумма к оплате</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Подсказка (доп.работы + химия): {hint.toLocaleString("ru-RU")} ₽. Можно оставить, изменить или вычесть скидку.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(",", "."))}
          onBlur={commit}
          disabled={disabled}
          inputMode="decimal"
          placeholder="0"
          className="h-12 flex-1 text-lg"
        />
        <span className="text-base text-zinc-600">₽</span>
      </div>
      {state === "saving" && <p className="mt-1 text-xs text-zinc-400">Сохранение...</p>}
      {state === "saved" && <p className="mt-1 text-xs text-green-600">✓ Сохранено</p>}
      {state === "error" && error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
