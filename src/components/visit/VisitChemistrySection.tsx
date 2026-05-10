"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  addVisitChemistryAction,
  updateVisitChemistryQtyAction,
  deleteVisitChemistryAction,
} from "@/lib/server-actions/visit-report";

type ChemRow = {
  id: string;
  nameAtMoment: string;
  unitAtMoment: string;
  priceAtMoment: string;
  qty: string;
};

type ChemItem = {
  id: string;
  name: string;
  unit: string;
  price: string;
};

export function VisitChemistrySection({
  visitId,
  rows,
  catalog,
  disabled = false,
}: {
  visitId: string;
  rows: ChemRow[];
  catalog: ChemItem[];
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ChemRow[]>(rows);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const options: ComboboxOption[] = catalog.map((c) => ({
    value: c.id,
    label: c.name,
    sub: `${c.unit} · ${Number(c.price).toLocaleString("ru-RU")} ₽`,
  }));

  function addRow() {
    if (!pickedId) {
      setError("Выберите позицию");
      return;
    }
    const qty = Number(draftQty.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      setError("Количество > 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addVisitChemistryAction({
        visitId,
        chemistryItemId: pickedId,
        qty,
      });
      if (result.ok) {
        const item = catalog.find((c) => c.id === pickedId);
        if (item) {
          setItems((arr) => [
            ...arr,
            {
              id: result.id,
              nameAtMoment: item.name,
              unitAtMoment: item.unit,
              priceAtMoment: item.price,
              qty: qty.toString(),
            },
          ]);
        }
        setPickedId(null);
        setDraftQty("");
      } else {
        setError(result.error);
      }
    });
  }

  function commitQty(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const qty = Number(item.qty.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      setError("Количество > 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateVisitChemistryQtyAction({ id, qty });
      if (!result.ok) setError(result.error);
    });
  }

  function deleteRow(id: string) {
    startTransition(async () => {
      const result = await deleteVisitChemistryAction({ id });
      if (result.ok) {
        setItems((arr) => arr.filter((i) => i.id !== id));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Химия</h2>

      {items.length === 0 && (
        <p className="mb-3 text-sm text-zinc-500">Химия не использовалась.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="mb-2 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-sm font-medium">{item.nameAtMoment}</div>
            <div className="text-xs text-zinc-500">
              {Number(item.priceAtMoment).toLocaleString("ru-RU")} ₽ / {item.unitAtMoment}
            </div>
          </div>
          <Input
            value={item.qty}
            onChange={(e) =>
              setItems((arr) =>
                arr.map((i) =>
                  i.id === item.id ? { ...i, qty: e.target.value.replace(",", ".") } : i,
                ),
              )
            }
            onBlur={() => commitQty(item.id)}
            disabled={disabled}
            inputMode="decimal"
            placeholder="0"
            className="h-11 w-20"
          />
          <span className="text-sm text-zinc-500">{item.unitAtMoment}</span>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => deleteRow(item.id)}
              className="h-11 w-11 p-0"
              aria-label="Удалить"
            >
              ✕
            </Button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 sm:flex-row">
          <div className="flex-1">
            <Combobox
              options={options}
              value={pickedId}
              onChange={setPickedId}
              placeholder="Выбрать позицию"
              emptyText="Ничего не найдено"
            />
          </div>
          <Input
            value={draftQty}
            onChange={(e) => setDraftQty(e.target.value.replace(",", "."))}
            inputMode="decimal"
            placeholder="Кол-во"
            className="h-11 w-full sm:w-28"
          />
          <Button type="button" onClick={addRow} className="h-11">
            +
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
