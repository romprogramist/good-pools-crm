import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { SubscribeButton } from "@/components/push/SubscribeButton";
import { DevicesList } from "@/components/push/DevicesList";
import { TestPushButton } from "@/components/push/TestPushButton";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader title="Настройки" />
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-zinc-900">Пуш-уведомления</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Подпиши текущий браузер — будем присылать новые заявки, отчёты и сообщения из чата.
            </p>
            <div className="mt-4">
              <SubscribeButton label="Подписать этот браузер" />
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-700">Подписанные устройства</h3>
              <div className="mt-2">
                <DevicesList />
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-zinc-900">Тестовый пуш</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Отправляет себе уведомление, чтобы проверить, что всё работает.
            </p>
            <div className="mt-4">
              <TestPushButton />
            </div>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
