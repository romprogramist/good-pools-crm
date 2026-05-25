import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader, Card } from "@/components/Page";

export default async function CustomersRegistryPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const customers = await prisma.customer.findMany({
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { pools: true } },
      pools: {
        select: {
          visits: {
            select: { status: true, totalAmount: true, paymentStatus: true },
          },
        },
      },
    },
  });

  const rows = customers.map((c) => {
    const visits = c.pools.flatMap((p) => p.visits);
    const completed = visits.filter((v) => v.status === "completed");
    const billed = completed.reduce(
      (s, v) => s + Number(v.totalAmount ?? 0),
      0,
    );
    const debt = completed
      .filter((v) => v.paymentStatus === "unpaid")
      .reduce((s, v) => s + Number(v.totalAmount ?? 0), 0);
    return {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      pools: c._count.pools,
      visitsTotal: visits.length,
      visitsCompleted: completed.length,
      billed,
      debt: Math.round(debt * 100) / 100,
    };
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Реестр клиентов"
          subtitle={`Клиентов: ${rows.length}`}
          actions={
            <Link
              href="/admin/registry"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← К реестрам
            </Link>
          }
        />

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Клиент</th>
                  <th className="px-5 py-3">Контакты</th>
                  <th className="px-5 py-3">Бассейнов</th>
                  <th className="px-5 py-3">Визитов</th>
                  <th className="px-5 py-3">Завершено</th>
                  <th className="px-5 py-3">Начислено</th>
                  <th className="px-5 py-3">Долг</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                      Клиентов пока нет.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/customers/${r.id}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {r.fullName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      <div>{r.phone ?? "—"}</div>
                      {r.email && (
                        <div className="text-xs text-zinc-500">{r.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{r.pools}</td>
                    <td className="px-5 py-4 text-zinc-700">{r.visitsTotal}</td>
                    <td className="px-5 py-4 text-zinc-700">{r.visitsCompleted}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-700">
                      {r.billed.toLocaleString("ru-RU")} ₽
                    </td>
                    <td
                      className={
                        r.debt > 0
                          ? "whitespace-nowrap px-5 py-4 font-semibold text-rose-700"
                          : "whitespace-nowrap px-5 py-4 text-zinc-500"
                      }
                    >
                      {r.debt > 0 ? `${r.debt.toLocaleString("ru-RU")} ₽` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="mt-4 text-xs text-zinc-500">
          «Начислено» — сумма всех завершённых визитов. «Долг» — сумма завершённых,
          но ещё не оплаченных визитов.
        </p>
      </PageContainer>
    </>
  );
}
