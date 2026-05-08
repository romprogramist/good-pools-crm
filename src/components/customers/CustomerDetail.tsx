import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, FormField, Alert } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/PhoneInput";
import {
  updateCustomerAction,
  deletePoolAction,
} from "@/lib/server-actions/customers";

type Scope = "admin" | "service";

export async function CustomerDetail({
  scope,
  customerId,
  edit,
  ok,
  error,
}: {
  scope: Scope;
  customerId: string;
  edit?: boolean;
  ok?: string;
  error?: string;
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      user: { select: { active: true, passwordHash: true, email: true } },
      pools: {
        orderBy: { createdAt: "asc" },
        include: {
          photos: {
            orderBy: { uploadedAt: "asc" },
            take: 1,
            select: { id: true, path: true },
          },
          _count: { select: { photos: true, instructions: true } },
        },
      },
    },
  });
  if (!customer) notFound();

  const base = `/${scope}/customers/${customerId}`;
  const listBase = `/${scope}/customers`;

  return (
    <>
      <PageHeader
        title={customer.fullName}
        subtitle={`Клиент · ${customer.pools.length} бассейн(ов)`}
        actions={
          <>
            <Link
              href={listBase}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← К списку
            </Link>
            <Link
              href={`${base}/pools/new`}
              className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
            >
              + Бассейн
            </Link>
          </>
        }
      />

      <div className="mt-6 space-y-4">
        {ok && <Alert variant="success">{decodeURIComponent(ok)}</Alert>}
        {error && <Alert variant="error">{decodeURIComponent(error)}</Alert>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">Контактная информация</h2>
            {!edit && (
              <Link
                href={`${base}?edit=1`}
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                Редактировать
              </Link>
            )}
          </div>

          {edit ? (
            <form action={updateCustomerAction} className="mt-4 space-y-4">
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="customerId" value={customer.id} />
              <FormField label="ФИО" htmlFor="fullName">
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={customer.fullName}
                  className="h-11 text-base"
                />
              </FormField>
              <FormField label="Телефон" htmlFor="phone">
                <PhoneInput id="phone" defaultValue={customer.phone ?? ""} />
              </FormField>
              <FormField label="Email" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={customer.email ?? ""}
                  className="h-11 text-base"
                />
              </FormField>
              <FormField
                label="Юр. информация"
                htmlFor="legalInfo"
                hint="ИП / ООО / реквизиты — необязательно"
              >
                <textarea
                  id="legalInfo"
                  name="legalInfo"
                  rows={3}
                  defaultValue={customer.legalInfo ?? ""}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
              </FormField>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="submit"
                  className="h-10 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                >
                  Сохранить
                </Button>
                <Link
                  href={base}
                  className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  Отмена
                </Link>
              </div>
            </form>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <Field label="ФИО" value={customer.fullName} />
              <Field label="Телефон" value={customer.phone ?? "—"} />
              <Field label="Email" value={customer.email ?? "—"} />
              <Field label="Аккаунт" value={customer.user.email} />
              <Field
                label="Статус"
                value={
                  !customer.user.active
                    ? "деактивирован"
                    : !customer.user.passwordHash
                      ? "ждёт установку пароля"
                      : "активен"
                }
              />
              <Field label="Юр. информация" value={customer.legalInfo ?? "—"} multiline />
            </dl>
          )}
        </Card>

        <Card padding="none" className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-base font-semibold text-zinc-900">Бассейны клиента</h2>
            <span className="text-xs text-zinc-500">{customer.pools.length}</span>
          </div>
          {customer.pools.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-500">
              У клиента пока нет бассейнов.
              <br />
              <Link
                href={`${base}/pools/new`}
                className="mt-2 inline-block font-medium text-teal-700 hover:text-teal-800"
              >
                Добавить первый →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.pools.map((pool) => (
                <li key={pool.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200">
                    {pool.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/pool-photos/${pool.id}/${encodeURIComponent(
                          pool.photos[0].path.split("/").pop() ?? "",
                        )}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`${base}/pools/${pool.id}`}
                      className="text-sm font-semibold text-zinc-900 hover:text-teal-700"
                    >
                      {pool.name}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      {pool.address ?? "адрес не указан"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {pool._count.photos} фото · {pool._count.instructions} инструкций
                      {pool.individualServicePrice
                        ? ` · ${pool.individualServicePrice.toString()} ₽`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`${base}/pools/${pool.id}`}
                      className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                    >
                      Открыть
                    </Link>
                    <form action={deletePoolAction}>
                      <input type="hidden" name="scope" value={scope} />
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={multiline ? "col-span-2 whitespace-pre-line text-zinc-900" : "col-span-2 text-zinc-900"}>
        {value}
      </dd>
    </div>
  );
}
