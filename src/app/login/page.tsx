import { Header } from "@/components/Header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer, Card, FormField, Alert } from "@/components/Page";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    if (session.user.role === "admin") redirect("/admin");
    if (session.user.role === "service") redirect("/service");
    redirect("/client");
  }

  const params = await searchParams;
  const showSetupSuccess = params.setup === "ok";
  const error = params.error;

  return (
    <>
      <Header />
      <PageContainer size="narrow" className="flex flex-col justify-center">
        <Card>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Вход в CRM
            </h1>
            <p className="text-sm text-zinc-500">
              Доступ выдаёт администратор компании
            </p>
          </div>

          {showSetupSuccess && (
            <div className="mt-5">
              <Alert variant="success">
                Администратор создан. Войдите с указанными данными.
              </Alert>
            </div>
          )}

          {error && (
            <div className="mt-5">
              <Alert variant="error">Неверный email или пароль</Alert>
            </div>
          )}

          <form action={loginAction} className="mt-6 space-y-4">
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="h-11 text-base"
              />
            </FormField>
            <FormField label="Пароль" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-11 text-base"
              />
            </FormField>

            <Button
              type="submit"
              className="h-11 w-full bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Войти
            </Button>
          </form>
        </Card>
      </PageContainer>
    </>
  );
}
