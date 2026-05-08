import dynamic from "next/dynamic";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { getVisitsInRange } from "@/lib/server-actions/visits";

const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView").then((m) => m.CalendarView),
  { ssr: false, loading: () => <Card><p className="text-sm text-zinc-500">Загрузка календаря…</p></Card> },
);

type SP = Promise<{ ok?: string; error?: string; date?: string; view?: string; servicer?: string }>;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // Берём диапазон ±60 дней от текущей даты — достаточно для месячного/недельного вида.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const visits = await getVisitsInRange(from, to, {
    serviceUserId: sp.servicer && sp.servicer !== "all" ? sp.servicer : undefined,
  });

  const calendarVisits = visits.map((v) => ({
    id: v.id,
    title: `${v.pool.customer.fullName} — ${v.pool.name}`,
    start: v.scheduledAt.toISOString(),
    end: new Date(
      v.scheduledAt.getTime() + v.durationMinutes * 60 * 1000,
    ).toISOString(),
    serviceUserId: v.serviceUserId,
    serviceUserName: v.serviceUser.name ?? "—",
    customerName: v.pool.customer.fullName,
    poolName: v.pool.name,
    status: v.status as "planned" | "in_progress" | "completed",
  }));

  const view =
    sp.view === "dayGridMonth" || sp.view === "timeGridDay" || sp.view === "listWeek"
      ? sp.view
      : "timeGridWeek";

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Календарь визитов"
          subtitle="Все визиты всех сервисников"
          actions={
            <Link href="/service/calendar/new">
              <Button>+ Визит</Button>
            </Link>
          }
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <div className="mt-6">
          <CalendarView visits={calendarVisits} initialView={view} initialDate={sp.date} />
        </div>
      </PageContainer>
    </>
  );
}
