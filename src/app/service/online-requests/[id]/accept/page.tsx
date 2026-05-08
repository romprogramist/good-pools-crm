import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import { acceptOnlineRequestAction } from "@/lib/server-actions/online-requests";
import { checkVisitConflicts } from "@/lib/server-actions/visits";

type Params = Promise<{ id: string }>;

export default async function AcceptRequestPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
  }

  const req = await prisma.onlineRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, fullName: true } },
      pool: { select: { id: true, name: true } },
    },
  });
  if (!req || req.status !== "pending") notFound();

  const serviceUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "service"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Предзаполняем slot = desiredFrom 10:00 (Europe/Moscow)
  const m = new Date(req.desiredFrom);
  // Сдвигаем к 10:00 по UTC+3 — это 07:00 UTC того же дня
  const scheduledAt = new Date(
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate(), 7, 0, 0),
  );

  async function checkAction(input: {
    serviceUserId: string;
    scheduledAt: string;
    durationMinutes: number;
  }) {
    "use server";
    return (
      await checkVisitConflicts({
        serviceUserId: input.serviceUserId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
      })
    ).map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      customerName: c.customerName,
      poolName: c.poolName,
    }));
  }

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title="Приём заявки"
          subtitle={`${req.customer.fullName} — ${req.pool.name}`}
        />
        <div className="mt-6">
          <VisitForm
            mode={{
              kind: "accept",
              requestId: req.id,
              acceptAction: acceptOnlineRequestAction,
              lockedCustomer: { id: req.customer.id, fullName: req.customer.fullName },
              lockedPool: { id: req.pool.id, name: req.pool.name },
              checkConflicts: checkAction,
            }}
            customers={[]}
            serviceUsers={serviceUsers}
            defaults={{
              customerId: req.customer.id,
              poolId: req.pool.id,
              serviceUserId: session.user.id,
              scheduledAt,
              durationMinutes: 60,
            }}
          />
        </div>
      </PageContainer>
    </>
  );
}
