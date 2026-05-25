import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, FormField, Alert } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { getCustomerDebt } from "@/lib/payments/debt";
import { createOnlineRequestAction } from "@/lib/server-actions/online-requests";

type SP = Promise<{ error?: string; poolId?: string }>;

function isoDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function RequestVisitPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== "client") {
    redirect("/");
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      pools: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true },
      },
    },
  });

  if (!customer) {
    return (
      <>
        <Header />
        <PageContainer size="narrow">
          <PageHeader title="Запись на сервис" />
          <div className="mt-6">
            <Alert variant="error">Профиль клиента не найден. Обратитесь к администратору.</Alert>
          </div>
        </PageContainer>
      </>
    );
  }

  const debt = await getCustomerDebt(customer.id);
  const hasDebt = debt > 0;
  const noPools = customer.pools.length === 0;
  const defaultPoolId = sp.poolId && customer.pools.some((p) => p.id === sp.poolId)
    ? sp.poolId
    : customer.pools[0]?.id ?? "";

  return (
    <>
      <Header />
      <PageContainer size="narrow">
        <PageHeader
          title="Запись на сервис"
          subtitle="Оставьте заявку — сервисник свяжется с вами и согласует дату"
        />

        {sp.error && (
          <div className="mt-4">
            <Alert variant="error">{decodeURIComponent(sp.error)}</Alert>
          </div>
        )}

        {noPools && (
          <div className="mt-6">
            <Alert variant="info">
              У вас пока нет бассейнов в системе. Свяжитесь с компанией, чтобы их добавили.
            </Alert>
          </div>
        )}

        {!noPools && hasDebt && (
          <div className="mt-6 flex flex-col gap-3">
            <Alert variant="error">
              По завершённым визитам есть задолженность{" "}
              <strong>{debt.toLocaleString("ru-RU")} ₽</strong>. Оплатите предыдущие
              визиты, прежде чем отправлять новую заявку.
            </Alert>
            <Link href="/client/visits" className="text-sm text-teal-700 underline">
              Посмотреть мои визиты →
            </Link>
          </div>
        )}

        {!noPools && !hasDebt && (
          <Card className="mt-6">
            <form action={createOnlineRequestAction} className="flex flex-col gap-4">
              <FormField label="Бассейн" htmlFor="poolId">
                <select
                  id="poolId"
                  name="poolId"
                  defaultValue={defaultPoolId}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  required
                >
                  {customer.pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.address ? ` — ${p.address}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Желаемая дата от" htmlFor="desiredFrom">
                  <Input
                    id="desiredFrom"
                    name="desiredFrom"
                    type="date"
                    defaultValue={isoDateOffset(1)}
                    min={isoDateOffset(0)}
                    required
                  />
                </FormField>
                <FormField label="Желаемая дата до" htmlFor="desiredTo">
                  <Input
                    id="desiredTo"
                    name="desiredTo"
                    type="date"
                    defaultValue={isoDateOffset(7)}
                    min={isoDateOffset(0)}
                    required
                  />
                </FormField>
              </div>

              <FormField
                label="Комментарий"
                htmlFor="message"
                hint="Опишите проблему или пожелания (необязательно)"
              >
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  maxLength={2000}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </FormField>

              <div className="flex justify-end gap-2">
                <Link href="/client">
                  <Button type="button" variant="secondary">
                    Отмена
                  </Button>
                </Link>
                <Button type="submit">Отправить заявку</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <Link href="/client/requests" className="text-sm text-teal-700 underline">
            Мои заявки →
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
