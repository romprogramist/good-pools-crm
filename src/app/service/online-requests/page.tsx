import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscowDate } from "@/lib/calendar/dates";
import { declineOnlineRequestAction } from "@/lib/server-actions/online-requests";

type SP = Promise<{ ok?: string; error?: string; tab?: string }>;

export default async function OnlineRequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }
  const isAdmin = session.user.role === "admin";

  const tab = sp.tab === "accepted" || sp.tab === "declined" ? sp.tab : "pending";

  const requests = await prisma.onlineRequest.findMany({
    where: { status: tab as "pending" | "accepted" | "declined" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      customer: { select: { fullName: true } },
      pool: { select: { name: true, address: true } },
      visit: { select: { id: true, scheduledAt: true } },
      acceptedBy: { select: { name: true } },
    },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader title="Онлайн-заявки" subtitle="Заявки клиентов на сервис" />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <div className="mt-6 flex gap-2 border-b border-zinc-200 pb-2">
          {(["pending", "accepted", "declined"] as const).map((t) => (
            <Link
              key={t}
              href={`/service/online-requests?tab=${t}`}
              className={
                tab === t
                  ? "rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium"
                  : "rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              }
            >
              {t === "pending" ? "Новые" : t === "accepted" ? "Принятые" : "Отклонённые"}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {requests.length === 0 && (
            <Card><p className="text-sm text-zinc-500">Пока нет заявок.</p></Card>
          )}
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-base font-semibold">
                    {r.customer.fullName} — {r.pool.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatMoscowDate(r.createdAt)}
                  </div>
                </div>
                {r.pool.address && (
                  <div className="text-xs text-zinc-500">{r.pool.address}</div>
                )}
                <div className="text-sm">
                  Желаемый период: {formatMoscowDate(r.desiredFrom)} — {formatMoscowDate(r.desiredTo)}
                </div>
                {r.message && (
                  <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">{r.message}</div>
                )}
                {r.status === "accepted" && r.visit && (
                  <div className="text-sm text-emerald-700">
                    Принята · визит {formatMoscowDate(r.visit.scheduledAt)} ·{" "}
                    {r.acceptedBy?.name ?? "—"} ·{" "}
                    <Link href={`/service/visits/${r.visit.id}`} className="underline">
                      открыть визит
                    </Link>
                  </div>
                )}
                {r.status === "declined" && (
                  <div className="text-sm text-red-700">
                    Отклонена · {r.acceptedBy?.name ?? "—"}
                    {r.declineReason && <>: {r.declineReason}</>}
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/service/online-requests/${r.id}/accept`}>
                      <Button>Принять</Button>
                    </Link>
                    {isAdmin && (
                      <form action={declineOnlineRequestAction}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Причина отклонения"
                          className="mr-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                        />
                        <Button type="submit" variant="destructive">Отклонить</Button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
