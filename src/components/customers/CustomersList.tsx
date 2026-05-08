import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/Page";

type RoleScope = "admin" | "service";

export async function CustomersList({
  scope,
  q,
}: {
  scope: RoleScope;
  q?: string;
}) {
  const term = (q ?? "").trim();
  const where = term
    ? {
        OR: [
          { fullName: { contains: term, mode: "insensitive" as const } },
          { phone: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      _count: { select: { pools: true } },
      user: { select: { active: true, passwordHash: true } },
    },
  });

  const base = scope === "admin" ? "/admin/customers" : "/service/customers";
  const newUserUrl = scope === "admin" ? "/admin/users?new=client" : null;

  return (
    <>
      <PageHeader
        title="Клиенты"
        subtitle={`Всего: ${customers.length}${term ? " · по запросу «" + term + "»" : ""}`}
        actions={
          newUserUrl ? (
            <Link
              href={newUserUrl}
              className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
            >
              + Клиент
            </Link>
          ) : undefined
        }
      />

      <form className="mt-6" action={base} method="get">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={term}
            placeholder="Поиск по ФИО, телефону или email"
            className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
          >
            Найти
          </button>
          {term && (
            <Link
              href={base}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Сбросить
            </Link>
          )}
        </div>
      </form>

      <Card padding="none" className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3">ФИО</th>
                <th className="px-5 py-3">Телефон</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Бассейнов</th>
                <th className="px-5 py-3">Статус</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    {term
                      ? "Никого не нашли. Попробуйте другой запрос."
                      : scope === "admin"
                        ? "Клиентов пока нет. Создайте первого через «+ Клиент»."
                        : "Клиентов пока нет. Их заводит администратор."}
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                >
                  <td className="px-5 py-4 font-medium text-zinc-900">
                    <Link href={`${base}/${c.id}`} className="hover:text-teal-700">
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-zinc-700">{c.phone ?? "—"}</td>
                  <td className="px-5 py-4 text-zinc-700">{c.email ?? "—"}</td>
                  <td className="px-5 py-4 text-zinc-700">{c._count.pools}</td>
                  <td className="px-5 py-4">
                    {!c.user.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                        деактивирован
                      </span>
                    ) : !c.user.passwordHash ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        ждёт пароль
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        активен
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`${base}/${c.id}`}
                      className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                    >
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
