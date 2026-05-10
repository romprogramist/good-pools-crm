import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatMoscow } from "@/lib/calendar/dates";

export default async function ClientVisitsListPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!customer) redirect("/client");

  const visits = await prisma.visit.findMany({
    where: { pool: { customerId: customer.id } },
    orderBy: { scheduledAt: "desc" },
    include: { pool: { select: { name: true } } },
  });

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader title="Мои визиты" />

        {visits.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-zinc-600">Пока визитов не было.</p>
          </Card>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {visits.map((v) => (
              <Card key={v.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-zinc-500">
                      {formatMoscow(v.scheduledAt)} · {v.pool.name}
                    </div>
                    <div className="mt-1 text-sm">
                      {v.status === "completed" && v.totalAmount ? (
                        <span>
                          Сумма:{" "}
                          <strong>
                            {Number(v.totalAmount).toLocaleString("ru-RU")} ₽
                          </strong>
                        </span>
                      ) : (
                        <span className="text-zinc-500">Статус: {v.status}</span>
                      )}
                    </div>
                  </div>
                  {v.status === "completed" ? (
                    <Link href={`/client/visits/${v.id}`}>
                      <Button variant="secondary" size="sm">
                        Открыть отчёт
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link href="/client">
            <Button variant="secondary">← На главную</Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
