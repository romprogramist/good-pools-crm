"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, FormField } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoscowLocalDateTime } from "@/lib/calendar/dates";

type CustomerOpt = { id: string; fullName: string; pools: { id: string; name: string }[] };
type ServiceUserOpt = { id: string; name: string | null };

type Conflict = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  customerName: string;
  poolName: string;
};

export type VisitFormMode =
  | { kind: "create"; createAction: (fd: FormData) => void; createSeriesAction: (fd: FormData) => void; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number }) => Promise<Conflict[]> }
  | { kind: "edit"; visitId: string; updateAction: (fd: FormData) => void; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number; excludeVisitId: string }) => Promise<Conflict[]> }
  | { kind: "accept"; requestId: string; acceptAction: (fd: FormData) => void; lockedCustomer: { id: string; fullName: string }; lockedPool: { id: string; name: string }; checkConflicts: (input: { serviceUserId: string; scheduledAt: string; durationMinutes: number }) => Promise<Conflict[]> };

type Props = {
  mode: VisitFormMode;
  customers: CustomerOpt[]; // для create / edit
  serviceUsers: ServiceUserOpt[];
  defaults?: {
    customerId?: string;
    poolId?: string;
    serviceUserId?: string;
    scheduledAt?: Date;
    durationMinutes?: number;
    notes?: string;
  };
};

export function VisitForm({ mode, customers, serviceUsers, defaults }: Props) {
  const [customerId, setCustomerId] = useState(defaults?.customerId ?? customers[0]?.id ?? "");
  const initialPools =
    customers.find((c) => c.id === customerId)?.pools ?? [];
  const [poolId, setPoolId] = useState(defaults?.poolId ?? initialPools[0]?.id ?? "");
  const [serviceUserId, setServiceUserId] = useState(
    defaults?.serviceUserId ?? serviceUsers[0]?.id ?? "",
  );
  const [scheduledAt, setScheduledAt] = useState(
    defaults?.scheduledAt
      ? formatMoscowLocalDateTime(defaults.scheduledAt)
      : formatMoscowLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [durationMinutes, setDurationMinutes] = useState(defaults?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [withSeries, setWithSeries] = useState(false);
  const [recurrence, setRecurrence] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [occurrences, setOccurrences] = useState(4);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const skipCheckRef = useRef(false);

  const showCustomerSelect = mode.kind !== "accept";
  const allowSeries = mode.kind === "create";

  const pools = useMemo(() => {
    if (mode.kind === "accept") return [mode.lockedPool];
    return customers.find((c) => c.id === customerId)?.pools ?? [];
  }, [customerId, customers, mode]);

  useEffect(() => {
    if (mode.kind === "accept") return;
    if (!pools.find((p) => p.id === poolId)) {
      setPoolId(pools[0]?.id ?? "");
    }
  }, [pools, poolId, mode.kind]);

  async function runConflictCheck() {
    setBusy(true);
    try {
      const input = { serviceUserId, scheduledAt, durationMinutes };
      const res =
        mode.kind === "edit"
          ? await mode.checkConflicts({ ...input, excludeVisitId: mode.visitId })
          : await mode.checkConflicts(input);
      setConflicts(res);
      setConfirming(res.length > 0);
      if (res.length === 0) {
        return true; // готовы к submit
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form
        onSubmit={async (e) => {
          if (skipCheckRef.current) {
            skipCheckRef.current = false;
            return; // даём форме уйти на server action
          }
          if (confirming) return; // следующий submit пройдёт уже без чека
          e.preventDefault();
          const form = e.currentTarget;
          const ok = await runConflictCheck();
          if (ok) {
            skipCheckRef.current = true;
            form.requestSubmit();
          }
        }}
        action={
          mode.kind === "create"
            ? withSeries ? mode.createSeriesAction : mode.createAction
            : mode.kind === "edit"
              ? mode.updateAction
              : mode.acceptAction
        }
        className="flex flex-col gap-4"
      >
        {mode.kind === "edit" && <input type="hidden" name="id" value={mode.visitId} />}
        {mode.kind === "accept" && (
          <input type="hidden" name="requestId" value={mode.requestId} />
        )}

        {showCustomerSelect ? (
          <FormField label="Клиент" htmlFor="customerId">
            <select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <div className="text-sm text-zinc-600">
            Клиент: <strong>{(mode as { lockedCustomer: { fullName: string } }).lockedCustomer.fullName}</strong>
          </div>
        )}

        <FormField label="Бассейн" htmlFor="poolId">
          <select
            id="poolId"
            name="poolId"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            disabled={mode.kind === "accept"}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            required
          >
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Сервисник" htmlFor="serviceUserId">
          <select
            id="serviceUserId"
            name="serviceUserId"
            value={serviceUserId}
            onChange={(e) => setServiceUserId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            required
          >
            {serviceUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.id}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Дата и время начала" htmlFor="scheduledAt">
          <Input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Длительность (мин)" htmlFor="durationMinutes">
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={1439}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            required
          />
        </FormField>

        <FormField label="Заметки" htmlFor="notes">
          <textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </FormField>

        {allowSeries && (
          <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withSeries}
                onChange={(e) => setWithSeries(e.target.checked)}
              />
              Серия повторов
            </label>
            {withSeries && (
              <>
                <FormField label="Период" htmlFor="recurrence">
                  <select
                    id="recurrence"
                    name="recurrence"
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(e.target.value as "weekly" | "biweekly" | "monthly")
                    }
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="weekly">Еженедельно</option>
                    <option value="biweekly">Раз в две недели</option>
                    <option value="monthly">Ежемесячно</option>
                  </select>
                </FormField>
                <FormField label="Количество повторов" htmlFor="occurrences">
                  <Input
                    id="occurrences"
                    name="occurrences"
                    type="number"
                    min={2}
                    max={52}
                    value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                  />
                </FormField>
              </>
            )}
          </div>
        )}

        {conflicts && conflicts.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <strong>У сервисника уже есть визиты в это время:</strong>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c.id}>
                  {new Date(c.scheduledAt).toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  — {c.customerName} / {c.poolName} ({c.durationMinutes} мин)
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={busy}>
            {confirming ? "Всё равно создать" : busy ? "Проверка…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
