"use client";

import { Button } from "@/components/ui/button";

export function VisitStickyBar({
  checklistFilled,
  checklistTotal,
  photoCount,
  totalAmount,
  onComplete,
  pending = false,
}: {
  checklistFilled: number;
  checklistTotal: number;
  photoCount: number;
  totalAmount: number | null;
  onComplete: () => void;
  pending?: boolean;
}) {
  const checklistOk = checklistFilled >= checklistTotal;
  const photoOk = photoCount >= 1;
  const amountOk = totalAmount != null && totalAmount >= 0;
  const canComplete = checklistOk && photoOk && amountOk && !pending;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="text-xs text-zinc-600">
          <div>Чек-лист: <span className={checklistOk ? "text-green-600" : "text-red-600"}>{checklistFilled}/{checklistTotal}</span></div>
          <div>Фото: <span className={photoOk ? "text-green-600" : "text-red-600"}>{photoCount}</span></div>
          <div>Сумма: <span className={amountOk ? "text-green-600" : "text-red-600"}>{amountOk ? `${totalAmount?.toLocaleString("ru-RU")} ₽` : "—"}</span></div>
        </div>
        <Button onClick={onComplete} disabled={!canComplete} className="h-12 px-5">
          {pending ? "Завершение..." : "Завершить визит"}
        </Button>
      </div>
    </div>
  );
}
