import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { VisitForm } from "@/components/calendar/VisitForm";
import {
  createVisitAction,
  checkVisitConflicts,
} from "@/lib/server-actions/visits";
import { createVisitSeriesAction } from "@/lib/server-actions/visit-series";

type SP = Promise<{ date?: string }>;

export default async function NewVisitPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/");
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

  const defaultDate = sp.date ? new Date(sp.date + "T10:00:00") : undefined;

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
        <PageHeader title="Новый визит" subtitle="Создание визита или серии" />
        <div className="mt-6">
          <VisitForm
            mode={{
              kind: "create",
              createAction: createVisitAction,
              createSeriesAction: createVisitSeriesAction,
              checkConflicts: checkAction,
            }}
            customers={customers.filter((c) => c.pools.length > 0)}
            serviceUsers={serviceUsers}
            defaults={{
              serviceUserId: session.user.id,
              scheduledAt: defaultDate,
            }}
          />
        </div>
      </PageContainer>
    </>
  );
}
