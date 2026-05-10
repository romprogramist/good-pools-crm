import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { formatMoscow } from "@/lib/calendar/dates";

const SECTIONS: { href: string; title: string; description: string; icon: React.ReactNode }[] = [
  {
    href: "/client/request-visit",
    title: "Записаться на сервис",
    description: "Оставьте заявку — сервисник свяжется и согласует дату.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M12 14v4M10 16h4" />
      </svg>
    ),
  },
  {
    href: "/client/requests",
    title: "Мои заявки",
    description: "История обращений и статусы.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export default async function ClientHome() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      pools: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true },
      },
    },
  });

  const pendingRequests = customer
    ? await prisma.onlineRequest.count({
        where: { customerId: customer.id, status: "pending" },
      })
    : 0;

  const recentVisits = customer
    ? await prisma.visit.findMany({
        where: { pool: { customerId: customer.id }, status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 3,
        include: { pool: { select: { name: true } } },
      })
    : [];

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Здравствуйте, ${session.user.name ?? ""}`}
          subtitle="Личный кабинет клиента «Хорошие Бассейны»"
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  {s.icon}
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-zinc-900">{s.title}</div>
                    {s.href === "/client/requests" && pendingRequests > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {pendingRequests} в обработке
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
                </div>
                <div className="mt-3 text-sm font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
                  Открыть →
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {recentVisits.length > 0 && (
          <section className="mt-10">
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Последние визиты</h2>
                <Link href="/client/visits" className="text-sm text-blue-600 hover:underline">
                  Все визиты →
                </Link>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {recentVisits.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/client/visits/${v.id}`}
                      className="flex justify-between rounded-md border border-zinc-200 px-3 py-2 hover:bg-zinc-50"
                    >
                      <span>
                        {formatMoscow(v.scheduledAt)} · {v.pool.name}
                      </span>
                      <span className="font-medium">
                        {v.totalAmount
                          ? `${Number(v.totalAmount).toLocaleString("ru-RU")} ₽`
                          : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Ваши бассейны</h2>
          {!customer || customer.pools.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">
                Бассейнов пока нет. Свяжитесь с компанией, чтобы их добавили.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {customer.pools.map((p) => (
                <Card key={p.id}>
                  <div className="text-base font-semibold text-zinc-900">{p.name}</div>
                  {p.address && (
                    <div className="mt-1 text-sm text-zinc-500">{p.address}</div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </PageContainer>
    </>
  );
}
