import { auth, signOut } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";

export default async function AdminHome() {
  const session = await auth();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <h1 className="text-2xl font-bold">
          Привет, {session?.user.name} ({session?.user.role})
        </h1>
        <p className="mt-2 text-zinc-600">Админ-панель — заглушка. Разделы появятся в следующих этапах.</p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-6"
        >
          <Button type="submit" variant="outline">Выйти</Button>
        </form>
      </main>
    </>
  );
}
