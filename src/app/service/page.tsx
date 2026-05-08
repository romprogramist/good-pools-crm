import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

const SECTIONS = [
  {
    href: "/service/customers",
    title: "Клиенты и бассейны",
    description: "Карточки клиентов, бассейны, фото, инструкции, карта объектов.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M2 22a8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5 8 8 0 0 0 4 0 8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5" />
        <path d="M2 17a8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5 8 8 0 0 0 4 0 8 8 0 0 1 4-1.5 8 8 0 0 1 4 1.5" />
        <path d="M7 14V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v9" />
      </svg>
    ),
  },
];

export default async function ServiceHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Привет, ${session?.user.name ?? ""}`}
          subtitle="Кабинет сервисника"
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  {s.icon}
                </div>
                <div className="mt-4">
                  <div className="text-base font-semibold text-zinc-900">
                    {s.title}
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

        <Card className="mt-6">
          <p className="text-sm text-zinc-500">
            Календарь, визиты и заявки появятся в следующих этапах.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
