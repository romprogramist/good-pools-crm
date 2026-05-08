import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";

export default async function ServiceHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={`Привет, ${session?.user.name ?? ""}`}
          subtitle="Кабинет сервисника"
        />
        <Card className="mt-8">
          <p className="text-sm text-zinc-500">
            Разделы появятся в следующих этапах: клиенты, бассейны, календарь, визиты.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
