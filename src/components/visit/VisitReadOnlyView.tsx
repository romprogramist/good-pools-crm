import type { Prisma } from "@prisma/client";
import { Card } from "@/components/Page";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";
import { formatMoscow } from "@/lib/calendar/dates";

export type VisitForReadOnly = Prisma.VisitGetPayload<{
  include: {
    pool: { include: { customer: true } };
    serviceUser: true;
    checklistAnswers: { include: { question: true } };
    photos: true;
    extraWorks: true;
    chemistry: true;
  };
}>;

function fmtAnswer(type: string, raw: unknown): string {
  const decoded = decodeChecklistValue(type as never, raw);
  if (decoded === null) return "—";
  if (Array.isArray(decoded)) return decoded.length ? decoded.join(", ") : "—";
  if (typeof decoded === "boolean") return decoded ? "Выполнено" : "Не выполнено";
  if (typeof decoded === "string") return decoded.trim() === "" ? "—" : decoded;
  return "—";
}

export function VisitReadOnlyView({ visit }: { visit: VisitForReadOnly }) {
  const answers = [...visit.checklistAnswers].sort(
    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
  );
  const works = [...visit.extraWorks].sort((a, b) => a.order - b.order);
  const chems = [...visit.chemistry].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-zinc-500">Клиент</dt>
          <dd>{visit.pool.customer.fullName}</dd>
          <dt className="text-zinc-500">Бассейн</dt>
          <dd>{visit.pool.name}</dd>
          <dt className="text-zinc-500">Дата</dt>
          <dd>{formatMoscow(visit.scheduledAt)}</dd>
          <dt className="text-zinc-500">Сервисник</dt>
          <dd>{visit.serviceUser.name ?? "—"}</dd>
          {visit.completedAt && (
            <>
              <dt className="text-zinc-500">Завершён</dt>
              <dd>{formatMoscow(visit.completedAt)}</dd>
            </>
          )}
        </dl>
      </Card>

      {answers.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Чек-лист</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {answers.map((a) => (
              <div key={a.id} className="flex justify-between gap-3 border-b border-zinc-100 pb-1.5">
                <dt className="text-zinc-600">{a.question.label}</dt>
                <dd className="text-right font-medium">
                  {fmtAnswer(a.question.type, a.value)}
                  {a.question.unit ? ` ${a.question.unit}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {visit.photos.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Фото объекта</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visit.photos.map((p) => (
              <a
                key={p.id}
                href={`/api/files/${p.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
              >
                <img src={`/api/files/${p.path}`} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {works.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Доп.работы</h3>
          <table className="w-full text-sm">
            <tbody>
              {works.map((w) => (
                <tr key={w.id} className="border-b border-zinc-100">
                  <td className="py-1.5">{w.name}</td>
                  <td className="py-1.5 text-right font-medium">
                    {Number(w.price).toLocaleString("ru-RU")} ₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {chems.length > 0 && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">Химия</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="pb-1.5 text-left">Позиция</th>
                <th className="pb-1.5 text-right">Кол-во</th>
                <th className="pb-1.5 text-right">Цена</th>
                <th className="pb-1.5 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {chems.map((c) => {
                const sum = Number(c.priceAtMoment) * Number(c.qty);
                return (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="py-1.5">{c.nameAtMoment}</td>
                    <td className="py-1.5 text-right">{Number(c.qty).toLocaleString("ru-RU")} {c.unitAtMoment}</td>
                    <td className="py-1.5 text-right">{Number(c.priceAtMoment).toLocaleString("ru-RU")} ₽</td>
                    <td className="py-1.5 text-right font-medium">{sum.toLocaleString("ru-RU")} ₽</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between text-base">
          <span className="text-zinc-600">ИТОГО К ОПЛАТЕ:</span>
          <span className="text-xl font-bold">
            {visit.totalAmount ? `${Number(visit.totalAmount).toLocaleString("ru-RU")} ₽` : "—"}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Статус оплаты: Не оплачен (онлайн-оплата подключается на этапе 13).
        </p>
      </Card>
    </div>
  );
}
