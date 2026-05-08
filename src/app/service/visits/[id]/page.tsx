import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import {
  updateVisitAction,
  cancelVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import { formatMoscow } from "@/lib/calendar/dates";

type Params = Promise<{ id: string }>;
type SP = Promise<{ ok?: string; error?: string }>;

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      pool: {
        select: {
          id: true,
          name: true,
          address: true,
          customer: { select: { id: true, fullName: true } },
        },
      },
      serviceUser: { select: { id: true, name: true } },
      series: { select: { id: true, recurrence: true, occurrences: true } },
      onlineRequest: { select: { id: true } },
    },
  });

  if (!visit) {
    return (
      <>
        <Header />
        <PageContainer>
          <PageHeader title="Визит не найден" />
          <div className="mt-6">
            <Alert variant="error">Этот визит не существует или был удалён.</Alert>
          </div>
          <div className="mt-4">
            <Link href="/service/calendar">
              <Button variant="secondary">← В календарь</Button>
            </Link>
          </div>
        </PageContainer>
      </>
    );
  }

  const customers = await prisma.customer.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      pools: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  const serviceUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
    excludeVisitId: string;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
        excludeVisitId: input.excludeVisitId,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  const editable = visit.status === "planned" || visit.status === "in_progress";

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title={`Визит ${formatMoscow(visit.scheduledAt)}`}
          subtitle={`${visit.pool.customer.fullName} — ${visit.pool.name}`}
        />

        {sp.ok && <div className="mt-4"><Alert variant="success">{decodeURIComponent(sp.ok)}</Alert></div>}
        {sp.error && <div className="mt-4"><Alert variant="error">{decodeURIComponent(sp.error)}</Alert></div>}

        <Card className="mt-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500">Статус</dt>
            <dd>{visit.status}</dd>
            <dt className="text-zinc-500">Тип</dt>
            <dd>{visit.kind}</dd>
            <dt className="text-zinc-500">Сервисник</dt>
            <dd>{visit.serviceUser.name ?? "—"}</dd>
            <dt className="text-zinc-500">Длительность</dt>
            <dd>{visit.durationMinutes} мин</dd>
            {visit.series && (
              <>
                <dt className="text-zinc-500">Серия</dt>
                <dd>
                  {visit.series.recurrence}, {visit.series.occurrences} повторов
                </dd>
              </>
            )}
            {visit.onlineRequest && (
              <>
                <dt className="text-zinc-500">Из онлайн-заявки</dt>
                <dd>#{visit.onlineRequest.id.slice(0, 8)}</dd>
              </>
            )}
          </dl>
        </Card>

        {editable && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Редактирование</h2>
            <VisitForm
              mode={{
                kind: "edit",
                visitId: visit.id,
                updateAction: updateVisitAction,
                checkConflicts: checkAction,
              }}
              customers={customers}
              serviceUsers={serviceUsers}
              defaults={{
                customerId: visit.pool.customer.id,
                poolId: visit.poolId,
                serviceUserId: visit.serviceUserId,
                scheduledAt: visit.scheduledAt,
                durationMinutes: visit.durationMinutes,
                notes: visit.notes ?? "",
              }}
            />
          </div>
        )}

        {editable && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Отмена визита</h2>
            <form action={cancelVisitAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={visit.id} />
              <textarea
                name="reason"
                rows={2}
                placeholder="Причина (необязательно)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="destructive">Отменить визит</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <Link href="/service/calendar">
            <Button variant="secondary">← В календарь</Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
