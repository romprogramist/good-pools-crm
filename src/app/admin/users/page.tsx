import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/PhoneInput";
import { PageContainer, PageHeader, Card, FormField, Alert } from "@/components/Page";
import {
  createAdminAction,
  createServiceAction,
  createClientAction,
  deactivateUserAction,
  activateUserAction,
  resendInviteAction,
} from "./actions";
import type { Role } from "@prisma/client";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  service: "Сервисник",
  client: "Клиент",
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-violet-100 text-violet-800",
  service: "bg-amber-100 text-amber-800",
  client: "bg-teal-100 text-teal-800",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "admin", label: "Админы" },
  { value: "service", label: "Сервисники" },
  { value: "client", label: "Клиенты" },
];

const NEW_FORMS: Record<string, { title: string; role: Role; withLegal: boolean }> = {
  admin: { title: "Новый администратор", role: "admin", withLegal: false },
  service: { title: "Новый сервисник", role: "service", withLegal: false },
  client: { title: "Новый клиент", role: "client", withLegal: true },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; new?: string; error?: string; ok?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.value === params.role)?.value ?? "all") as
    | "all"
    | Role;
  const newKind = params.new && params.new in NEW_FORMS ? params.new : null;

  const where = filter === "all" ? {} : { role: filter as Role };
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      active: true,
      passwordHash: true,
      createdAt: true,
    },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Пользователи"
          subtitle="Администраторы, сервисники и клиенты системы"
          actions={
            <>
              <Link
                href="/admin/users?new=admin"
                className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                + Админ
              </Link>
              <Link
                href="/admin/users?new=service"
                className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                + Сервисник
              </Link>
              <Link
                href="/admin/users?new=client"
                className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
              >
                + Клиент
              </Link>
            </>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{decodeURIComponent(params.ok)}</Alert>}
          {params.error && <Alert variant="error">{decodeURIComponent(params.error)}</Alert>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/admin/users" : `/admin/users?role=${f.value}`}
              className={
                filter === f.value
                  ? "inline-flex h-9 items-center rounded-full bg-teal-600 px-4 text-sm font-medium text-white shadow-sm"
                  : "inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
              }
            >
              {f.label}
            </Link>
          ))}
        </div>

        {newKind && <NewUserForm kind={newKind} />}

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Имя</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Телефон</th>
                  <th className="px-5 py-3">Роль</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                      Пользователей нет. Создай первого через кнопки выше.
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-5 py-4 font-medium text-zinc-900">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{u.email}</td>
                    <td className="px-5 py-4 text-zinc-700">{u.phone ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role]}`}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {!u.active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          деактивирован
                        </span>
                      ) : !u.passwordHash ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          ждёт пароль
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          активен
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {!u.passwordHash && u.active && (
                          <form action={resendInviteAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button
                              type="submit"
                              className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                            >
                              Переотправить
                            </button>
                          </form>
                        )}
                        {u.id !== session.user.id && (
                          <form
                            action={u.active ? deactivateUserAction : activateUserAction}
                          >
                            <input type="hidden" name="userId" value={u.id} />
                            <button
                              type="submit"
                              className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                            >
                              {u.active ? "Деактивировать" : "Активировать"}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}

function NewUserForm({ kind }: { kind: string }) {
  const cfg = NEW_FORMS[kind];
  const action =
    cfg.role === "admin"
      ? createAdminAction
      : cfg.role === "service"
        ? createServiceAction
        : createClientAction;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">{cfg.title}</h2>
        <Link
          href={`/admin/users?role=${cfg.role}`}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Закрыть
        </Link>
      </div>

      <form action={action} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={cfg.role === "client" ? "ФИО" : "Имя"} htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              className="h-11 text-base"
              placeholder="Иван Иванов"
            />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              required
              className="h-11 text-base"
              placeholder="user@example.com"
            />
          </FormField>
          <FormField label="Телефон" htmlFor="phone">
            <PhoneInput id="phone" />
          </FormField>
          {cfg.withLegal && (
            <FormField
              label="Юр.информация"
              htmlFor="legalInfo"
              hint="ИП / ООО / реквизиты — необязательно"
            >
              <Input
                id="legalInfo"
                name="legalInfo"
                className="h-11 text-base"
                placeholder="ИП Иванов И.И."
              />
            </FormField>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            Создать и отправить приглашение
          </Button>
          <Link
            href={`/admin/users?role=${cfg.role}`}
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
        </div>
      </form>
    </Card>
  );
}
