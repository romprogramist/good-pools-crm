"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addExtraWorkAction,
  updateExtraWorkAction,
  deleteExtraWorkAction,
} from "@/lib/server-actions/visit-report";

type Work = { id: string; name: string; price: string };

export function VisitExtraWorksSection({
  visitId,
  works,
  disabled = false,
}: {
  visitId: string;
  works: Work[];
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Work[]>(works);
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function addItem() {
    const price = Number(draft.price.replace(",", "."));
    if (!draft.name.trim() || isNaN(price) || price < 0) {
      setError("Введите название и цену");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addExtraWorkAction({
        visitId,
        name: draft.name.trim(),
        price,
      });
      if (result.ok) {
        setItems((arr) => [...arr, { id: result.id, name: draft.name.trim(), price: price.toString() }]);
        setDraft({ name: "", price: "" });
      } else {
        setError(result.error);
      }
    });
  }

  function updateRow(id: string, field: "name" | "price", value: string) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function commitRow(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const price = Number(item.price.replace(",", "."));
    if (!item.name.trim() || isNaN(price) || price < 0) {
      setError("Название и цена обязательны");
      return;
    }
    startTransition(async () => {
      const result = await updateExtraWorkAction({ id, name: item.name.trim(), price });
      if (!result.ok) setError(result.error);
      else setError(null);
    });
  }

  function deleteRow(id: string) {
    startTransition(async () => {
      const result = await deleteExtraWorkAction({ id });
      if (result.ok) {
        setItems((arr) => arr.filter((i) => i.id !== id));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Доп.работы</h2>

      {items.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Доп.работ нет.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="mb-2 flex gap-2">
          <Input
            value={item.name}
            onChange={(e) => updateRow(item.id, "name", e.target.value)}
            onBlur={() => commitRow(item.id)}
            disabled={disabled}
            placeholder="Название работы"
            className="h-11 flex-1"
          />
          <Input
            value={item.price}
            onChange={(e) => updateRow(item.id, "price", e.target.value.replace(",", "."))}
            onBlur={() => commitRow(item.id)}
            disabled={disabled}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-28"
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => deleteRow(item.id)}
              aria-label="Удалить"
              className="h-11 w-11 p-0"
            >
              ✕
            </Button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="mt-3 flex gap-2 border-t border-zinc-200 pt-3">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Название работы"
            className="h-11 flex-1"
          />
          <Input
            value={draft.price}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value.replace(",", ".") }))}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-28"
          />
          <Button type="button" onClick={addItem} className="h-11">
            +
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
