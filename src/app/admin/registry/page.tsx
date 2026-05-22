import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

const SECTIONS = [
  {
    href: "/admin/registry/checklists",
    title: "Реестр чек-листов",
    description: "Все ответы чек-листов по завершённым визитам. Экспорт в Excel и CSV.",
  },
  {
    href: "/admin/registry/visits",
    title: "Реестр визитов",
    description: "Все визиты с фильтрами по периоду, клиенту и сервиснику.",
  },
  {
    href: "/admin/registry/customers",
    title: "Реестр клиентов",
    description: "Клиенты, их бассейны, завершённые визиты и начисленные суммы.",
  },
];

export default async function RegistryHomePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Реестры"
          subtitle="Сводные таблицы по визитам, чек-листам и клиентам"
          actions={
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← В админку
            </Link>
          }
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="text-base font-semibold text-zinc-900">
                  {s.title}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
                <div className="mt-3 text-sm font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
                  Открыть →
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
