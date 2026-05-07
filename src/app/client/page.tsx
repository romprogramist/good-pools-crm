import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export default async function ClientHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <h1 className="text-2xl font-bold">
          Привет, {session?.user.name} ({session?.user.role})
        </h1>
        <p className="mt-2 text-zinc-600">Личный кабинет клиента — заглушка.</p>

        <form action={logoutAction} className="mt-6">
          <Button type="submit" variant="outline">Выйти</Button>
        </form>
      </main>
    </>
  );
}
