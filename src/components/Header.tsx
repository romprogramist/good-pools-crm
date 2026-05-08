import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  service: "Сервисник",
  client: "Клиент",
};

export async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M2 17c2 1 4 1 6 0s4-1 6 0 4 1 6 0" />
              <path d="M2 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0" />
              <path d="M6 8a4 4 0 0 1 8 0v8" />
              <path d="M14 8h4" />
              <circle cx="14" cy="8" r="1.4" fill="currentColor" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide text-zinc-900 sm:text-[15px]">
              ХОРОШИЕ БАССЕЙНЫ
            </span>
            <span className="text-xs text-zinc-500">CRM сервиса</span>
          </div>
        </Link>

        {session?.user ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-zinc-900">
                {session.user.name ?? session.user.email}
              </div>
              <div className="text-xs text-zinc-500">
                {ROLE_LABEL[session.user.role] ?? session.user.role}
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Выйти
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
          >
            Войти
          </Link>
        )}
      </div>
    </header>
  );
}
