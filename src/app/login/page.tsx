import { Header } from "@/components/Header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-2xl font-bold text-zinc-900">Вход в CRM</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Доступ выдаёт администратор компании
          </p>

          {showSetupSuccess && (
            <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-200">
              Администратор создан. Войдите с указанными данными.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
              Неверный email или пароль
            </div>
          )}

          <form action={loginAction} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1"
              />
            </div>

            <Button type="submit" className="w-full">
              Войти
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
