import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { isSetupComplete } from "@/lib/setup";
import { setupAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer, Card, FormField } from "@/components/Page";

export default async function SetupPage() {
  if (await isSetupComplete()) notFound();

  return (
    <>
      <Header />
      <PageContainer size="narrow" className="flex flex-col justify-center">
        <Card>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Первый запуск
            </h1>
            <p className="text-sm text-zinc-500">
              Создайте учётную запись администратора компании. Эта страница доступна
              только один раз.
            </p>
          </div>

          <form action={setupAction} className="mt-6 space-y-4">
            <FormField label="ФИО администратора" htmlFor="name">
              <Input
                id="name"
                name="name"
                required
                placeholder="Иван Иванов"
                className="h-11 text-base"
              />
            </FormField>
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@example.com"
                className="h-11 text-base"
              />
            </FormField>
            <FormField label="Пароль" htmlFor="password" hint="Минимум 8 символов">
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="h-11 text-base"
              />
            </FormField>

            <Button
              type="submit"
              className="h-11 w-full bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Создать администратора
            </Button>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
