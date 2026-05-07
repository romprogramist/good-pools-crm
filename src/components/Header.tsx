import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M3 17a4 4 0 0 1 4-2c1.5 0 2.5 1 4 1s2.5-1 4-1 2.5 1 4 1 2.5-1 4-1v3c-1.5 0-2.5 1-4 1s-2.5-1-4-1-2.5 1-4 1-2.5-1-4-1-2.5 1-4 1v-2zM6 12V6a2 2 0 0 1 2-2h2v8H6zm8-8h2a2 2 0 0 1 2 2v6h-4V4z" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide text-zinc-900">
              ХОРОШИЕ БАССЕЙНЫ
            </span>
            <span className="text-xs text-zinc-500">CRM сервиса</span>
          </div>
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          Войти
        </Link>
      </div>
    </header>
  );
}
