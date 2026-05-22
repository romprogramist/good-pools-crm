import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { getChecklistRegistry } from "@/lib/registry/checklists";
import { formatMoscowDate } from "@/lib/calendar/dates";

export default async function ChecklistRegistryPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const { columns, rows } = await getChecklistRegistry();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Реестр чек-листов"
          subtitle={`Завершённых визитов: ${rows.length}`}
          actions={
            <>
              <Link
                href="/admin/registry"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                ← К реестрам
              </Link>
              <a
                href="/admin/registry/checklists/export?format=xlsx"
                className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
              >
                Экспорт в Excel
              </a>
              <a
                href="/admin/registry/checklists/export?format=csv"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
              >
                Экспорт в CSV
              </a>
            </>
          }
        />

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Дата</th>
                  <th className="whitespace-nowrap px-4 py-3">Клиент</th>
                  <th className="whitespace-nowrap px-4 py-3">Объект</th>
                  <th className="whitespace-nowrap px-4 py-3">Сервисник</th>
                  {columns.map((c) => (
                    <th key={c.id} className="px-4 py-3 min-w-[12rem]">
                      {c.unit ? `${c.label}, ${c.unit}` : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + columns.length}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      Завершённых визитов пока нет.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.visitId}
                    className="border-b border-zinc-100 last:border-b-0 align-top hover:bg-zinc-50/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {formatMoscowDate(r.date)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/service/visits/${r.visitId}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {r.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{r.poolName}</td>
                    <td className="px-4 py-3 text-zinc-700">{r.servicerName}</td>
                    {columns.map((c) => (
                      <td key={c.id} className="px-4 py-3 text-zinc-700">
                        {r.answers[c.id] ? r.answers[c.id] : "—"}
                      </td>
                    ))}
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
