import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

const SECTIONS = [
  {
    href: "/admin/users",
    title: "Пользователи",
    description: "Администраторы, сервисники, клиенты. Приглашения по email.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/admin/customers",
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
    href: "/admin/equipment-templates",
    title: "Шаблоны оборудования",
    description: "Типовое оборудование с гарантией и регламентом замены.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    href: "/admin/checklist",
    title: "Чек-лист",
    description: "Вопросы, которые сервисник заполняет на визите.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/admin/chemistry",
    title: "Прайс химии",
    description: "Позиции химии с ценами для добавления в визит.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M10 2v7.31" />
        <path d="M14 9.3V1.99" />
        <path d="M8.5 2h7" />
        <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
        <path d="M5.52 16h12.96" />
      </svg>
    ),
  },
  {
    href: "/admin/registry",
    title: "Реестры",
    description: "Сводные таблицы чек-листов, визитов и клиентов. Экспорт в Excel/CSV.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 3h18v18H3z" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
      </svg>
    ),
  },
  {
    href: "/admin/activity-log",
    title: "Журнал действий",
    description: "История всех действий пользователей с фильтрами.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 8v4l3 3" />
        <path d="M3.05 11a9 9 0 1 1 .5 4" />
        <path d="M3 22v-6h6" />
      </svg>
    ),
  },
  {
    href: "/admin/support",
    title: "Поддержка",
    description: "Чат с клиентами — обращения в поддержку.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
      </svg>
    ),
  },
];

export default async function AdminHome() {
  const session = await auth();
  const unreadChat = await prisma.chatMessage.count({
    where: { readAt: null, sender: { role: "client" } },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Привет, ${session?.user.name ?? ""}`}
          subtitle="Админ-панель CRM «Хорошие Бассейны»"
        />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition hover:ring-teal-400 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  {s.icon}
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-zinc-900">
                      {s.title}
                    </div>
                    {s.href === "/admin/support" && unreadChat > 0 && (
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
      </PageContainer>
    </>
  );
}
