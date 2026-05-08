import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscowDate, formatMoscow } from "@/lib/calendar/dates";

type SP = Promise<{ ok?: string; error?: string }>;

const STATUS_LABEL: Record<"pending" | "accepted" | "declined", string> = {
  pending: "В обработке",
  accepted: "Принята",
  declined: "Отклонена",
};

const STATUS_STYLE: Record<"pending" | "accepted" | "declined", string> = {
  pending: "bg-amber-50 text-amber-900 ring-amber-200",
  accepted: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  declined: "bg-red-50 text-red-900 ring-red-200",
};

export default async function ClientRequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!customer) {
    return (
      <>
        <Header />
        <PageContainer>
          <PageHeader title="Мои заявки" />
          <div className="mt-6">
            <Alert variant="error">Профиль клиента не найден. Обратитесь к администратору.</Alert>
          </div>
        </PageContainer>
      </>
    );
  }

  const requests = await prisma.onlineRequest.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      pool: { select: { name: true, address: true } },
      visit: { select: { id: true, scheduledAt: true } },
      acceptedBy: { select: { name: true } },
    },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Мои заявки"
          subtitle="История ваших обращений на сервис"
          actions={
            <Link href="/client/request-visit">
              <Button>+ Новая заявка</Button>
            </Link>
          }
        />

        {sp.ok && (
          <div className="mt-4">
            <Alert variant="success">{decodeURIComponent(sp.ok)}</Alert>
          </div>
        )}
        {sp.error && (
          <div className="mt-4">
            <Alert variant="error">{decodeURIComponent(sp.error)}</Alert>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {requests.length === 0 && (
            <Card>
              <p className="text-sm text-zinc-500">
                Заявок пока нет.{" "}
                <Link href="/client/request-visit" className="text-teal-700 underline">
                  Оставьте первую
                </Link>
                .
              </p>
            </Card>
          )}

          {requests.map((r) => {
            const status = r.status as "pending" | "accepted" | "declined";
            return (
              <Card key={r.id}>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-base font-semibold">{r.pool.name}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  {r.pool.address && (
                    <div className="text-xs text-zinc-500">{r.pool.address}</div>
                  )}
                  <div className="text-sm">
                    Желаемый период: {formatMoscowDate(r.desiredFrom)} —{" "}
                    {formatMoscowDate(r.desiredTo)}
                  </div>
                  {r.message && (
                    <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">{r.message}</div>
                  )}
                  {status === "accepted" && r.visit && (
                    <div className="text-sm text-emerald-800">
                      Визит назначен на {formatMoscow(r.visit.scheduledAt)}
                      {r.acceptedBy?.name ? ` (сервисник: ${r.acceptedBy.name})` : ""}.
                    </div>
                  )}
                  {status === "declined" && (
                    <div className="text-sm text-red-800">
                      {r.declineReason
                        ? `Причина отказа: ${r.declineReason}`
                        : "Заявка отклонена."}
                    </div>
                  )}
                  <div className="text-xs text-zinc-400">
                    Отправлено {formatMoscow(r.createdAt)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </PageContainer>
    </>
  );
}
