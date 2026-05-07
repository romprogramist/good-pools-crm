import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { isSetupComplete } from "@/lib/setup";
import { setupAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function SetupPage() {
  if (await isSetupComplete()) notFound();

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-2xl font-bold text-zinc-900">Первый запуск</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Создайте учётную запись администратора компании. Эта страница доступна
            только один раз.
          </p>

          <form action={setupAction} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="name">ФИО администратора</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Иван Иванов"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Пароль (минимум 8 символов)</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-1"
              />
            </div>

            <Button type="submit" className="w-full">
              Создать администратора
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
