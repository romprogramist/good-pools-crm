import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

export default async function ClientHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Здравствуйте, ${session?.user.name ?? ""}`}
          subtitle="Личный кабинет клиента «Хорошие Бассейны»"
        />
        <Card className="mt-8">
          <p className="text-sm text-zinc-500">
            Разделы появятся в следующих этапах: ваши бассейны, история обслуживаний,
            заявки, чат поддержки.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
