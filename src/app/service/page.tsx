import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { UpcomingEquipmentWidget } from "@/components/service/UpcomingEquipmentWidget";
import { UpcomingVisitsWidget } from "@/components/service/UpcomingVisitsWidget";
import { prisma } from "@/lib/prisma";
import { SubscribeBanner } from "@/components/push/SubscribeBanner";

const SECTIONS: { href: string; title: string; description: string; icon: React.ReactNode }[] = [
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
  {
    href: "/service/calendar",
    title: "Календарь",
    description: "Все визиты сервисников в одном месте. Создание визита и серий.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/service/online-requests",
    title: "Онлайн-заявки",
    description: "Заявки клиентов на сервис.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/service/support",
    title: "Поддержка",
    description: "Чат с клиентами — вопросы по обслуживанию.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
      </svg>
    ),
  },
];

export default async function ServiceHome() {
  const session = await auth();
  const pendingRequests = await prisma.onlineRequest.count({ where: { status: "pending" } });
  const unreadChat = await prisma.chatMessage.count({
    where: { readAt: null, sender: { role: "client" } },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Привет, ${session?.user.name ?? ""}`}
          subtitle="Кабинет сервисника"
        />

        <SubscribeBanner />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  {s.icon}
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-zinc-900">{s.title}</div>
                    {s.href === "/service/online-requests" && pendingRequests > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {pendingRequests}
                      </span>
                    )}
                    {s.href === "/service/support" && unreadChat > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {unreadChat}
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

        <UpcomingEquipmentWidget scope="service" />
        <UpcomingVisitsWidget />
      </PageContainer>
    </>
  );
}
