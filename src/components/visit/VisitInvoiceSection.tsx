import { Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { markVisitPaidAction } from "@/lib/server-actions/visit-report";
import { formatMoscow } from "@/lib/calendar/dates";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

type Props = {
  visitId: string;
  status: "planned" | "in_progress" | "completed" | "canceled";
  totalAmount: { toString(): string } | null;
  invoiceIssuedAt: Date | null;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  paymentMethod: PaymentMethod | null;
  canMarkPaid: boolean;
};

function methodLabel(m: PaymentMethod | null): string {
  if (m === "cash") return "наличными";
  if (m === "transfer") return "переводом";
  return "—";
}

function todayLocalInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function VisitInvoiceSection({
  visitId,
  status,
  totalAmount,
  invoiceIssuedAt,
  paymentStatus,
  paidAt,
  paymentMethod,
  canMarkPaid,
}: Props) {
  if (status !== "completed") return null;

  const totalLabel = totalAmount
    ? `${Number(totalAmount).toLocaleString("ru-RU")} ₽`
    : "—";

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Счёт</h2>
          {invoiceIssuedAt && (
            <p className="mt-0.5 text-xs text-zinc-500">
              Выставлен {formatMoscow(invoiceIssuedAt)}
            </p>
          )}
        </div>
        <span
          className={
            paymentStatus === "paid"
              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
              : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
          }
        >
          {paymentStatus === "paid" ? "Оплачено" : "К оплате"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-zinc-500">Сумма</dt>
        <dd className="font-semibold">{totalLabel}</dd>
        {paymentStatus === "paid" && paidAt && (
          <>
            <dt className="text-zinc-500">Дата оплаты</dt>
            <dd>{formatMoscow(paidAt)}</dd>
            <dt className="text-zinc-500">Способ</dt>
            <dd>{methodLabel(paymentMethod)}</dd>
          </>
        )}
      </dl>

      {paymentStatus === "unpaid" && canMarkPaid && (
        <form action={markVisitPaidAction} className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4">
          <input type="hidden" name="visitId" value={visitId} />
          <div>
            <label className="text-xs font-medium text-zinc-600">Способ оплаты</label>
            <div className="mt-1 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="method" value="cash" required defaultChecked />
                Наличные
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="method" value="transfer" required />
                Перевод
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="paidAt" className="text-xs font-medium text-zinc-600">Дата оплаты</label>
            <input
              id="paidAt"
              name="paidAt"
              type="date"
              defaultValue={todayLocalInput()}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit">Отметить оплаченным</Button>
          </div>
        </form>
      )}

      {paymentStatus === "unpaid" && !canMarkPaid && (
        <p className="mt-3 text-sm text-zinc-600">
          Оплатите счёт удобным способом и сообщите сервиснику — он подтвердит факт оплаты.
        </p>
      )}
    </Card>
  );
}
