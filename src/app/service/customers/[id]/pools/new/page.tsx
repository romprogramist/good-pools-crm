import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { PoolForm } from "@/components/pools/PoolForm";
import { getMapsApiKey } from "@/lib/maps";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function ServicePoolNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, fullName: true },
  });
  if (!customer) notFound();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Новый бассейн"
          subtitle={`Клиент: ${customer.fullName}`}
        />
        {sp.error && (
          <div className="mt-6">
            <Alert variant="error">{decodeURIComponent(sp.error)}</Alert>
          </div>
        )}
        <Card className="mt-6">
          <PoolForm
            scope="service"
            customerId={customer.id}
            mapsApiKey={getMapsApiKey()}
            cancelHref={`/service/customers/${customer.id}`}
          />
        </Card>
      </PageContainer>
    </>
  );
}
