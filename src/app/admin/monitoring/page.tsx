import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { StatusBadge } from "@/components/monitoring/StatusBadge";
import { CopyButton, NewControllerForm, RegenerateToken } from "@/components/monitoring/AdminControls";
import { controllerStatus } from "@/lib/monitoring/view";
import { formatAgo } from "@/lib/monitoring/format";
import { webhookUrl } from "@/lib/monitoring/token";
import { buildEngineerMemo } from "@/lib/monitoring/memo";
import { setControllerActiveAction, updateControllerAction } from "@/lib/server-actions/monitoring";

export const dynamic = "force-dynamic";

const inputCls =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function AdminMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; ok?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const isNew = params.new === "1";
  const now = new Date();
  const url = webhookUrl();

  const [controllers, customers] = await Promise.all([
    prisma.monitoringController.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        customer: { select: { fullName: true } },
        alarms: { where: { clearedAt: null }, select: { severity: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Контроллеры мониторинга"
          subtitle="Подключение приборов на объектах: адрес и токен для инженера"
          actions={
            <>
              <Link
                href="/admin"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                ← В админку
              </Link>
              <Link
                href="/service/monitoring"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-50"
              >
                Открыть мониторинг
              </Link>
              {!isNew && (
                <Link
                  href="/admin/monitoring?new=1"
                  className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
                >
                  + Новый контроллер
                </Link>
              )}
            </>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{params.ok}</Alert>}
          {params.error && <Alert variant="error">{params.error}</Alert>}
        </div>

        {isNew && <NewControllerForm customers={customers} />}

        {controllers.length === 0 && !isNew && (
          <Card className="mt-6">
            <h2 className="text-lg font-semibold text-zinc-900">Как это работает</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
              <li>Нажмите «+ Новый контроллер» и назовите объект.</li>
              <li>CRM выдаст адрес, токен и controller_id — скопируйте памятку и отправьте инженеру.</li>
              <li>Инженер прописывает их в контроллере на объекте.</li>
              <li>
                Аварии и показания начнут появляться в разделе «Мониторинг», а сервисникам будут приходить
                уведомления.
              </li>
            </ol>
          </Card>
        )}

        <div className="mt-6 space-y-4">
          {controllers.map((c) => {
            const status = controllerStatus(c, c.alarms, now);
            const editing = params.edit === c.id;
            const memo = buildEngineerMemo({ name: c.name, url, externalId: c.externalId });
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-zinc-900">{c.name}</div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      {c.customer ? c.customer.fullName : "Клиент не привязан"}
                      {c.notes && <> · {c.notes}</>}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">controller_id</dt>
                    <dd className="mt-0.5 font-mono text-zinc-900">{c.externalId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Токен</dt>
                    <dd className="mt-0.5 font-mono text-zinc-900">…{c.tokenHint}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Последняя связь</dt>
                    <dd className="mt-0.5 text-zinc-900">
                      {c.lastSeenAt ? formatAgo(c.lastSeenAt, now) : "ещё не было"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Сообщений за 90 дней</dt>
                    <dd className="mt-0.5 tabular-nums text-zinc-900">{c._count.messages}</dd>
                  </div>
                </dl>

                {editing ? (
                  <form action={updateControllerAction} className="mt-5 space-y-4 border-t border-zinc-100 pt-5">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`name-${c.id}`} className="text-sm font-medium text-zinc-700">
                          Название объекта
                        </label>
                        <input
                          id={`name-${c.id}`}
                          name="name"
                          required
                          maxLength={160}
                          defaultValue={c.name}
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`cust-${c.id}`} className="text-sm font-medium text-zinc-700">
                          Клиент
                        </label>
                        <select
                          id={`cust-${c.id}`}
                          name="customerId"
                          defaultValue={c.customerId ?? ""}
                          className={inputCls}
                        >
                          <option value="">Не привязывать</option>
                          {customers.map((cu) => (
                            <option key={cu.id} value={cu.id}>
                              {cu.fullName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`notes-${c.id}`} className="text-sm font-medium text-zinc-700">
                        Заметка
                      </label>
                      <input
                        id={`notes-${c.id}`}
                        name="notes"
                        maxLength={1000}
                        defaultValue={c.notes ?? ""}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
                      >
                        Сохранить
                      </button>
                      <Link
                        href="/admin/monitoring"
                        className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Отмена
                      </Link>
                    </div>
                  </form>
                ) : (
                  <div className="mt-5 flex flex-wrap items-start gap-2 border-t border-zinc-100 pt-4">
                    <Link
                      href={`/service/monitoring/${c.id}`}
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-50"
                    >
                      Показания и аварии
                    </Link>
                    <Link
                      href={`/admin/monitoring?edit=${c.id}`}
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                    >
                      Изменить
                    </Link>
                    <CopyButton
                      text={memo}
                      label="Памятка для инженера (без токена)"
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                    />
                    <form action={setControllerActiveAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                      >
                        {c.active ? "Отключить" : "Включить"}
                      </button>
                    </form>
                    <div className="w-full sm:w-auto">
                      <RegenerateToken id={c.id} name={c.name} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {controllers.length > 0 && (
          <p className="mt-4 text-xs text-zinc-500">
            Адрес вебхука для всех контроллеров один: <span className="font-mono">{url}</span>. Контроллеры
            различаются токеном.
          </p>
        )}
      </PageContainer>
    </>
  );
}
