import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader, Card, FormField } from "@/components/Page";
import { formatMoscow } from "@/lib/calendar/dates";

const MAX_ROWS = 500;

const ENTITY_LABEL: Record<string, string> = {
  user: "Пользователь",
  customer: "Клиент",
  pool: "Бассейн",
  equipment: "Оборудование",
  equipmentTemplate: "Шаблон оборудования",
  checklist: "Чек-лист",
  chemistry: "Химия",
  visit: "Визит",
  online_request: "Онлайн-заявка",
  push: "Push-уведомление",
};

const VERB_LABEL: Record<string, string> = {
  create: "создание",
  update: "изменение",
  delete: "удаление",
  activate: "активация",
  deactivate: "скрытие",
  reorder: "изменение порядка",
  replaced: "замена",
  cancel: "отмена",
  started: "начат",
  completed: "завершён",
  reopened: "переоткрыт",
  upload: "загрузка",
  add: "добавление",
  accept: "принятие",
  decline: "отклонение",
  invite: "приглашение",
  password: "установка пароля",
  queued: "поставлено в очередь",
};

function labelForAction(action: string): string {
  const parts = action.split(".");
  const entity = ENTITY_LABEL[parts[0]];
  const verb = VERB_LABEL[parts[parts.length - 1]];
  if (entity && verb) return `${entity}: ${verb}`;
  if (entity) return entity;
  return action;
}

function parseDay(value: string | undefined, end: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${end ? "23:59:59" : "00:00:00"}+03:00`);
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    actorId?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const actorId = params.actorId || "";
  const action = params.action || "";
  const from = parseDay(params.from, false);
  const to = parseDay(params.to, true);

  const where: Prisma.ActivityLogWhereInput = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const [logs, users, actionGroups] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      include: { actor: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.activityLog.groupBy({
      by: ["action"],
      orderBy: { action: "asc" },
    }),
  ]);

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Журнал действий"
          subtitle={
            logs.length === MAX_ROWS
              ? `Показаны последние ${MAX_ROWS} записей — уточните фильтры`
              : `Записей: ${logs.length}`
          }
          actions={
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← В админку
            </Link>
          }
        />

        <Card className="mt-6">
          <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="Пользователь" htmlFor="actorId">
              <select
                id="actorId"
                name="actorId"
                defaultValue={actorId}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Все</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Тип события" htmlFor="action">
              <select
                id="action"
                name="action"
                defaultValue={action}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Все события</option>
                {actionGroups.map((g) => (
                  <option key={g.action} value={g.action}>
                    {labelForAction(g.action)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Период с" htmlFor="from">
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={params.from ?? ""}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </FormField>
            <FormField label="Период по" htmlFor="to">
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={params.to ?? ""}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </FormField>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                Применить
              </button>
              <Link
                href="/admin/activity-log"
                className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Сбросить
              </Link>
            </div>
          </form>
        </Card>

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Дата и время</th>
                  <th className="px-5 py-3">Кто</th>
                  <th className="px-5 py-3">Действие</th>
                  <th className="px-5 py-3">Объект</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-zinc-500">
                      Записей по заданным фильтрам не найдено.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-700">
                      {formatMoscow(log.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {log.actor?.name ?? log.actor?.email ?? "система"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-900">
                        {labelForAction(log.action)}
                      </div>
                      <div className="text-xs text-zinc-400">{log.action}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-500">
                      {log.entityType ?? "—"}
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
