"use client";

import { useState } from "react";
import { Card, FormField } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addEquipmentAction,
  updateEquipmentAction,
  markReplacedTodayAction,
  deleteEquipmentAction,
} from "@/lib/server-actions/equipment";
import { SendRegulationTestButton } from "@/components/equipment/SendRegulationTestButton";
import {
  computeEquipmentDates,
  daysUntil,
  formatDateRu,
  toInputDate,
} from "@/lib/equipment";

type Scope = "admin" | "service";

type TemplateOption = {
  id: string;
  typeName: string;
  defaultWarrantyMonths: number;
  regulationPeriodDays: number;
};

type EquipmentItem = {
  id: string;
  typeName: string;
  serial: string | null;
  installDate: string;
  warrantyMonths: number;
  regulationPeriodDays: number;
  lastReplacementDate: string | null;
  notes: string | null;
};

export function PoolEquipment({
  scope,
  customerId,
  poolId,
  templates,
  equipment,
}: {
  scope: Scope;
  customerId: string;
  poolId: string;
  templates: TemplateOption[];
  equipment: EquipmentItem[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id ?? "",
  );

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const today = toInputDate(new Date());

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">Оборудование</h2>
        {!adding && templates.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            + Добавить
          </button>
        )}
      </div>

      {templates.length === 0 && !adding && (
        <p className="mt-4 text-sm text-zinc-500">
          Сначала создайте хотя бы один шаблон оборудования в разделе админки «Шаблоны оборудования».
        </p>
      )}

      {adding && (
        <form
          action={addEquipmentAction}
          className="mt-4 space-y-4 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200"
        >
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="poolId" value={poolId} />

          <FormField label="Шаблон" htmlFor="templateId">
            <select
              id="templateId"
              name="templateId"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.typeName} (гарантия {t.defaultWarrantyMonths} мес, регламент {t.regulationPeriodDays} дн)
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Дата установки" htmlFor="installDate">
              <Input
                id="installDate"
                name="installDate"
                type="date"
                required
                defaultValue={today}
                className="h-11 text-base"
              />
            </FormField>
            <FormField label="Серийный номер" htmlFor="serial" hint="необязательно">
              <Input
                id="serial"
                name="serial"
                maxLength={120}
                className="h-11 text-base"
              />
            </FormField>
            <FormField
              label="Гарантия (мес)"
              htmlFor="warrantyMonths"
              hint="по умолчанию из шаблона"
            >
              <Input
                key={`warranty-${selectedTemplateId}`}
                id="warrantyMonths"
                name="warrantyMonths"
                type="number"
                min={0}
                max={600}
                defaultValue={selectedTemplate?.defaultWarrantyMonths ?? 12}
                className="h-11 text-base"
              />
            </FormField>
            <FormField
              label="Регламент (дни)"
              htmlFor="regulationPeriodDays"
              hint="по умолчанию из шаблона"
            >
              <Input
                key={`regulation-${selectedTemplateId}`}
                id="regulationPeriodDays"
                name="regulationPeriodDays"
                type="number"
                min={0}
                max={3650}
                defaultValue={selectedTemplate?.regulationPeriodDays ?? 90}
                className="h-11 text-base"
              />
            </FormField>
          </div>

          <FormField label="Заметки" htmlFor="notes" hint="необязательно">
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={2000}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </FormField>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="h-10 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Добавить
            </Button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {equipment.length > 0 && (
        <ul className="mt-4 space-y-3">
          {equipment.map((eq) => {
            const installDate = new Date(eq.installDate);
            const lastReplacement = eq.lastReplacementDate
              ? new Date(eq.lastReplacementDate)
              : null;
            const { warrantyEnd, nextRegulation } = computeEquipmentDates({
              installDate,
              warrantyMonths: eq.warrantyMonths,
              regulationPeriodDays: eq.regulationPeriodDays,
              lastReplacementDate: lastReplacement,
            });

            const isEditing = editingId === eq.id;

            return (
              <li
                key={eq.id}
                className="rounded-xl bg-white p-4 ring-1 ring-zinc-200"
              >
                {!isEditing && (
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900">
                          {eq.typeName}
                        </span>
                        {eq.serial && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                            S/N {eq.serial}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-zinc-600 sm:grid-cols-2">
                        <span>
                          Установлено: <b>{formatDateRu(installDate)}</b>
                        </span>
                        <span>
                          Последняя замена:{" "}
                          <b>{formatDateRu(lastReplacement)}</b>
                        </span>
                        <DateBadge
                          label="Гарантия до"
                          date={warrantyEnd}
                          warnDays={14}
                        />
                        <DateBadge
                          label="Регламент"
                          date={nextRegulation}
                          warnDays={7}
                        />
                      </div>
                      {eq.notes && (
                        <div className="mt-2 whitespace-pre-line text-xs text-zinc-500">
                          {eq.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={markReplacedTodayAction}>
                        <input type="hidden" name="scope" value={scope} />
                        <input type="hidden" name="customerId" value={customerId} />
                        <input type="hidden" name="poolId" value={poolId} />
                        <input type="hidden" name="equipmentId" value={eq.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700"
                        >
                          Заменено сегодня
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setEditingId(eq.id)}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                      >
                        Изменить
                      </button>
                      <form action={deleteEquipmentAction}>
                        <input type="hidden" name="scope" value={scope} />
                        <input type="hidden" name="customerId" value={customerId} />
                        <input type="hidden" name="poolId" value={poolId} />
                        <input type="hidden" name="equipmentId" value={eq.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-red-700 transition hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </form>
                      {scope === "admin" && (
                        <SendRegulationTestButton equipmentId={eq.id} />
                      )}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <form action={updateEquipmentAction} className="space-y-4">
                    <input type="hidden" name="scope" value={scope} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="equipmentId" value={eq.id} />

                    <div className="text-sm font-semibold text-zinc-900">
                      {eq.typeName}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Дата установки" htmlFor={`installDate-${eq.id}`}>
                        <Input
                          id={`installDate-${eq.id}`}
                          name="installDate"
                          type="date"
                          required
                          defaultValue={toInputDate(installDate)}
                          className="h-11 text-base"
                        />
                      </FormField>
                      <FormField label="Серийный номер" htmlFor={`serial-${eq.id}`}>
                        <Input
                          id={`serial-${eq.id}`}
                          name="serial"
                          maxLength={120}
                          defaultValue={eq.serial ?? ""}
                          className="h-11 text-base"
                        />
                      </FormField>
                      <FormField
                        label="Гарантия (мес)"
                        htmlFor={`warrantyMonths-${eq.id}`}
                      >
                        <Input
                          id={`warrantyMonths-${eq.id}`}
                          name="warrantyMonths"
                          type="number"
                          min={0}
                          max={600}
                          required
                          defaultValue={eq.warrantyMonths}
                          className="h-11 text-base"
                        />
                      </FormField>
                      <FormField
                        label="Регламент (дни)"
                        htmlFor={`regulationPeriodDays-${eq.id}`}
                      >
                        <Input
                          id={`regulationPeriodDays-${eq.id}`}
                          name="regulationPeriodDays"
                          type="number"
                          min={0}
                          max={3650}
                          required
                          defaultValue={eq.regulationPeriodDays}
                          className="h-11 text-base"
                        />
                      </FormField>
                      <FormField
                        label="Дата последней замены"
                        htmlFor={`lastReplacementDate-${eq.id}`}
                        hint="оставьте пустым, если замены ещё не было"
                      >
                        <Input
                          id={`lastReplacementDate-${eq.id}`}
                          name="lastReplacementDate"
                          type="date"
                          defaultValue={toInputDate(lastReplacement)}
                          className="h-11 text-base"
                        />
                      </FormField>
                    </div>

                    <FormField label="Заметки" htmlFor={`notes-${eq.id}`}>
                      <textarea
                        id={`notes-${eq.id}`}
                        name="notes"
                        rows={2}
                        maxLength={2000}
                        defaultValue={eq.notes ?? ""}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      />
                    </FormField>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        className="h-10 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                      >
                        Сохранить
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {equipment.length === 0 && !adding && templates.length > 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          Оборудования пока нет. Добавьте из шаблона.
        </p>
      )}
    </Card>
  );
}

function DateBadge({
  label,
  date,
  warnDays,
}: {
  label: string;
  date: Date | null;
  warnDays: number;
}) {
  if (!date) {
    return (
      <span>
        {label}: <b>—</b>
      </span>
    );
  }
  const days = daysUntil(date);
  const overdue = days < 0;
  const soon = days >= 0 && days <= warnDays;

  let cls = "text-zinc-600";
  if (overdue) cls = "text-red-700 font-semibold";
  else if (soon) cls = "text-amber-700 font-semibold";

  return (
    <span className={cls}>
      {label}: {formatDateRu(date)}
      {overdue && ` (просрочено на ${Math.abs(days)} дн)`}
      {soon && ` (через ${days} дн)`}
    </span>
  );
}
