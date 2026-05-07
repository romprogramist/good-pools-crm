import { Header } from "@/components/Header";

export default function LoginPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-2xl font-bold text-zinc-900">Вход в CRM</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Доступ выдаёт администратор компании
          </p>

          <form className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Пароль
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white opacity-50"
              title="Логика появится на этапе 2"
            >
              Войти
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-zinc-400">
            Логика входа подключается на этапе 2
          </p>
        </div>
      </main>
    </>
  );
}
