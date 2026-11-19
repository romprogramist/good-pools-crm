import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { AutoRefresh } from "@/components/monitoring/AutoRefresh";
import { StatusBadge, StatusIcon, STATUS_STYLE } from "@/components/monitoring/StatusBadge";
import { cn } from "@/lib/utils";
import {
  controllerStatus,
  parseSummary,
  STATUS_ORDER,
  type MonitorStatus,
} from "@/lib/monitoring/view";
import { formatAgo, formatDateTime } from "@/lib/monitoring/format";

export const dynamic = "force-dynamic";

const KEY_METRICS = 4;

export default async function MonitoringListPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/login");
  }
  const isAdmin = session.user.role === "admin";
  const now = new Date();

  const controllers = await prisma.monitoringController.findMany({
    where: isAdmin ? {} : { active: true },
    include: {
      customer: { select: { fullName: true } },
      alarms: { where: { clearedAt: null }, orderBy: [{ severity: "asc" }, { raisedAt: "desc" }] },
    },
  });

  const rows = controllers
    .map((c) => ({ c, status: controllerStatus(c, c.alarms, now), zones: parseSummary(c.lastSummary) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.c.name.localeCompare(b.c.name, "ru"));

  const count = (s: MonitorStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const tiles: { label: string; value: number; status: MonitorStatus }[] = [
    { label: "В норме", value: count(["ok"]), status: "ok" },
    { label: "Требуют внимания", value: count(["warning"]), status: "warning" },
    { label: "Аварии", value: count(["critical"]), status: "critical" },
    { label: "Нет связи", value: count(["offline"]), status: "offline" },
  ];

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Мониторинг бассейнов"
          subtitle="Показания приборов и аварии с объектов. Данные присылает контроллер на объекте."
          actions={
            <>
              <Link
                href={isAdmin ? "/admin" : "/service"}
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                ← Назад
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/monitoring"
                  className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
                >
                  Настройка контроллеров
                </Link>
              )}
            </>
          }
        />

        {rows.length === 0 ? (
          <Card className="mt-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <StatusIcon status="waiting" className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-900">Пока нет подключённых объектов</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              {isAdmin
                ? "Создайте контроллер — CRM выдаст адрес и токен, которые нужно передать инженеру на объекте."
                : "Когда администратор подключит контроллер объекта, здесь появятся показания и аварии."}
            </p>
            {isAdmin && (
              <Link
                href="/admin/monitoring?new=1"
                className="mt-5 inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                + Подключить контроллер
              </Link>
            )}
          </Card>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-500">
                Объектов: <span className="font-semibold text-zinc-900">{rows.length}</span>
              </div>
              <AutoRefresh />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((t) => (
                <div
                  key={t.label}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200",
                    t.value === 0 && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      STATUS_STYLE[t.status].iconBg,
                    )}
                  >
                    <StatusIcon status={t.status} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold leading-none tabular-nums text-zinc-900">{t.value}</div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{t.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {rows.map(({ c, status, zones }) => (
                <Link key={c.id} href={`/service/monitoring/${c.id}`} className="group block">
                  <div className="relative h-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 transition group-hover:shadow-md group-hover:ring-teal-400">
                    <div className={cn("absolute inset-y-0 left-0 w-1.5", STATUS_STYLE[status].accent)} />
                    <div className="p-5 pl-6 sm:p-6 sm:pl-7">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-zinc-900 sm:text-lg">{c.name}</div>
                          {c.customer && (
                            <div className="truncate text-sm text-zinc-500">{c.customer.fullName}</div>
                          )}
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      {c.alarms.length > 0 && (
                        <ul className="mt-4 space-y-1.5">
                          {c.alarms.slice(0, 3).map((a) => (
                            <li key={a.id} className="flex items-start gap-2 text-sm">
                              <span
                                className={cn(
                                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                  a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                                )}
                              >
                                <StatusIcon
                                  status={a.severity === "critical" ? "critical" : "warning"}
                                  className="h-3 w-3"
                                />
                              </span>
                              <span className="min-w-0 text-zinc-800">
                                <span className="font-medium">{a.title}</span>
                                {a.zoneTitle && <span className="text-zinc-500"> · {a.zoneTitle}</span>}
                                <span className="text-zinc-500"> · {formatAgo(a.raisedAt, now)}</span>
                              </span>
                            </li>
                          ))}
                          {c.alarms.length > 3 && (
                            <li className="pl-7 text-sm text-zinc-500">и ещё {c.alarms.length - 3}</li>
                          )}
                        </ul>
                      )}

                      {zones.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {zones.map((z) => {
                            const key = z.metrics
                              .filter((m) => typeof m.value === "number" && !m.isSetpoint)
                              .slice(0, KEY_METRICS);
                            return (
                              <div key={z.zone} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                <span className="font-medium text-zinc-700">{z.title}</span>
                                {z.online === false ? (
                                  <span className="text-zinc-500">станция не на связи</span>
                                ) : key.length === 0 ? (
                                  <span className="text-zinc-400">нет показаний</span>
                                ) : (
                                  key.map((m) => (
                                    <span key={m.key} className="whitespace-nowrap text-zinc-500">
                                      {m.label}{" "}
                                      <span
                                        className={cn(
                                          "font-semibold tabular-nums",
                                          m.outOfRange ? "text-amber-700" : "text-zinc-900",
                                        )}
                                      >
                                        {m.display}
                                        {m.unit ? ` ${m.unit}` : ""}
                                      </span>
                                    </span>
                                  ))
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                        <span>
                          {c.lastSeenAt
                            ? `На связи: ${formatAgo(c.lastSeenAt, now)}`
                            : "Контроллер ещё не выходил на связь"}
                          {c.lastSummaryAt && ` · показания от ${formatDateTime(c.lastSummaryAt, now)}`}
                        </span>
                        <span className="font-medium text-teal-700">Подробнее →</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </PageContainer>
    </>
  );
}
