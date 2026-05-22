import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, VisitStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader, Card, FormField } from "@/components/Page";
import { formatMoscow } from "@/lib/calendar/dates";

const STATUS_LABEL: Record<VisitStatus, string> = {
  planned: "Запланирован",
  in_progress: "В работе",
  completed: "Завершён",
  canceled: "Отменён",
};

const STATUS_BADGE: Record<VisitStatus, string> = {
  planned: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  canceled: "bg-zinc-200 text-zinc-600",
};

/** "YYYY-MM-DD" → Date на границе суток по Москве (UTC+3). */
function parseDay(value: string | undefined, end: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${end ? "23:59:59" : "00:00:00"}+03:00`);
}

export default async function VisitsRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    customerId?: string;
    servicerId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const from = parseDay(params.from, false);
  const to = parseDay(params.to, true);
  const customerId = params.customerId || "";
  const servicerId = params.servicerId || "";

  const where: Prisma.VisitWhereInput = {};
  if (from || to) {
    where.scheduledAt = {};
    if (from) where.scheduledAt.gte = from;
    if (to) where.scheduledAt.lte = to;
  }
  if (customerId) where.pool = { customerId };
  if (servicerId) where.serviceUserId = servicerId;

  const [visits, customers, servicers] = await Promise.all([
    prisma.visit.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      include: {
        pool: { include: { customer: true } },
        serviceUser: true,
      },
    }),
    prisma.customer.findMany({ orderBy: { fullName: "asc" } }),
    prisma.user.findMany({
      where: { role: "service" },
      orderBy: { name: "asc" },
    }),
  ]);

  const total = visits.reduce((s, v) => s + Number(v.totalAmount ?? 0), 0);

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Реестр визитов"
          subtitle={`Найдено: ${visits.length} · сумма: ${total.toLocaleString("ru-RU")} ₽`}
          actions={
            <Link
              href="/admin/registry"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← К реестрам
            </Link>
          }
        />

        <Card className="mt-6">
          <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="Период с" htmlFor="from">
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={params.from ?? ""}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </FormField>
            <FormField label="Период по" htmlFor="to">
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={params.to ?? ""}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </FormField>
            <FormField label="Клиент" htmlFor="customerId">
              <select
                id="customerId"
                name="customerId"
                defaultValue={customerId}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Все клиенты</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Сервисник" htmlFor="servicerId">
              <select
                id="servicerId"
                name="servicerId"
                defaultValue={servicerId}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Все сервисники</option>
                {servicers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                Применить
              </button>
              <Link
                href="/admin/registry/visits"
                className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Сбросить
              </Link>
            </div>
          </form>
        </Card>

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Дата и время</th>
                  <th className="px-5 py-3">Клиент</th>
                  <th className="px-5 py-3">Объект</th>
                  <th className="px-5 py-3">Сервисник</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {visits.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                      Визитов по заданным фильтрам не найдено.
                    </td>
                  </tr>
                )}
                {visits.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-700">
                      {formatMoscow(v.scheduledAt)}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/service/visits/${v.id}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {v.pool.customer.fullName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{v.pool.name}</td>
                    <td className="px-5 py-4 text-zinc-700">
                      {v.serviceUser.name ?? v.serviceUser.email}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status]}`}
                      >
                        {STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-700">
                      {v.totalAmount
                        ? `${Number(v.totalAmount).toLocaleString("ru-RU")} ₽`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}
