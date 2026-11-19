import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card } from "@/components/Page";
import { AutoRefresh } from "@/components/monitoring/AutoRefresh";
import { LineChart } from "@/components/monitoring/LineChart";
import {
  SeverityBadge,
  StatusBadge,
  StatusIcon,
  STATUS_STYLE,
} from "@/components/monitoring/StatusBadge";
import { cn } from "@/lib/utils";
import {
  alarmHint,
  buildSeries,
  controllerStatus,
  formatNumber,
  parseSummary,
  type MonitorStatus,
  type Series,
} from "@/lib/monitoring/view";
import { formatAgo, formatDateTime, formatDuration } from "@/lib/monitoring/format";

export const dynamic = "force-dynamic";

const RANGES = {
  "24h": { label: "Сутки", ms: 24 * 3_600_000 },
  "7d": { label: "Неделя", ms: 7 * 86_400_000 },
  "30d": { label: "Месяц", ms: 30 * 86_400_000 },
} as const;
type RangeKey = keyof typeof RANGES;

function statusSentence(
  status: MonitorStatus,
  openCount: number,
  lastSeenAt: Date | null,
  now: Date,
): { title: string; text: string } {
  switch (status) {
    case "ok":
      return { title: "Всё в порядке", text: "Аварий нет, контроллер на связи." };
    case "warning":
      return {
        title: openCount === 1 ? "Есть предупреждение" : `Предупреждений: ${openCount}`,
        text: "Объект работает, но требует внимания — подробности ниже.",
      };
    case "critical":
      return {
        title: "Авария на объекте",
        text: "Нужна реакция сервисника — что случилось и что делать, написано ниже.",
      };
    case "offline":
      return {
        title: "Нет связи с контроллером",
        text: lastSeenAt
          ? `Молчит ${formatDuration((now.getTime() - lastSeenAt.getTime()) / 1000)} — последний раз выходил на связь ${formatDateTime(lastSeenAt, now)}. Возможно, на объекте нет света или интернета. Показания ниже могли устареть.`
          : "Контроллер не выходит на связь.",
      };
    case "waiting":
      return {
        title: "Ждём первое сообщение",
        text: "Контроллер создан в CRM, но ещё ничего не прислал. Как только инженер настроит отправку, данные появятся здесь.",
      };
    default:
      return { title: "Контроллер отключён", text: "Сообщения от него не принимаются. Включить можно в настройке контроллеров." };
  }
}

export default async function MonitoringDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    redirect("/login");
  }
  const isAdmin = session.user.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  const range: RangeKey = sp.range && sp.range in RANGES ? (sp.range as RangeKey) : "24h";

  const now = new Date();
  const from = new Date(now.getTime() - RANGES[range].ms);
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);

  const controller = await prisma.monitoringController.findUnique({
    where: { id },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
  });
  if (!controller || (!controller.active && !isAdmin)) notFound();

  const [openAlarms, history, readings, lastMessages] = await Promise.all([
    prisma.monitoringAlarm.findMany({
      where: { controllerId: id, clearedAt: null },
      orderBy: [{ severity: "asc" }, { raisedAt: "desc" }],
    }),
    prisma.monitoringAlarm.findMany({
      where: { controllerId: id, clearedAt: { not: null } },
      orderBy: { raisedAt: "desc" },
      take: 50,
    }),
    prisma.monitoringReading.findMany({
      where: { controllerId: id, at: { gte: from < dayAgo ? from : dayAgo } },
      orderBy: { at: "asc" },
      select: { at: true, payload: true },
    }),
    isAdmin
      ? prisma.monitoringMessage.findMany({
          where: { controllerId: id },
          orderBy: { receivedAt: "desc" },
          take: 15,
        })
      : Promise.resolve([]),
  ]);

  const status = controllerStatus(controller, openAlarms, now);
  const sentence = statusSentence(status, openAlarms.length, controller.lastSeenAt, now);
  const zones = parseSummary(controller.lastSummary);

  const series = buildSeries(readings.filter((r) => r.at >= from));
  const daySeries = new Map(buildSeries(readings.filter((r) => r.at >= dayAgo)).map((s) => [s.id, s]));

  const seriesByZone = new Map<string, { title: string; items: Series[] }>();
  for (const s of series) {
    const g = seriesByZone.get(s.zone) ?? { title: s.zoneTitle, items: [] };
    g.items.push(s);
    seriesByZone.set(s.zone, g);
  }
  for (const g of seriesByZone.values()) g.items.sort((a, b) => a.order - b.order);

  const style = STATUS_STYLE[status];
  const backHref = "/service/monitoring";

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title={controller.name}
          subtitle={
            <>
              {controller.customer ? (
                <Link
                  href={`/${isAdmin ? "admin" : "service"}/customers/${controller.customer.id}`}
                  className="font-medium text-teal-700 hover:underline"
                >
                  {controller.customer.fullName}
                </Link>
              ) : (
                "Клиент не привязан"
              )}
              {controller.customer?.phone && (
                <>
                  {" · "}
                  <a href={`tel:${controller.customer.phone}`} className="text-teal-700 hover:underline">
                    {controller.customer.phone}
                  </a>
                </>
              )}
            </>
          }
          actions={
            <Link
              href={backHref}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← Все объекты
            </Link>
          }
        />

        {/* Главный ответ страницы: что с объектом прямо сейчас */}
        <div className={cn("mt-6 flex items-start gap-4 rounded-2xl p-5 ring-1 sm:p-6", style.banner)}>
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", style.iconBg)}>
            <StatusIcon status={status} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold sm:text-xl">{sentence.title}</div>
            <p className="mt-1 text-sm opacity-80 sm:text-base">{sentence.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-80">
              {controller.lastSeenAt && <span>На связи: {formatAgo(controller.lastSeenAt, now)}</span>}
              <AutoRefresh />
            </div>
          </div>
        </div>

        {/* Активные аварии */}
        {openAlarms.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900">
              Сейчас активно <span className="text-zinc-400">· {openAlarms.length}</span>
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {openAlarms.map((a) => {
                const critical = a.severity === "critical";
                const hint = alarmHint(a.code);
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-2xl bg-white p-5 shadow-sm ring-1",
                      critical ? "ring-red-300" : "ring-amber-300",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-zinc-900">{a.title}</div>
                        {a.zoneTitle && <div className="text-sm text-zinc-500">{a.zoneTitle}</div>}
                      </div>
                      <SeverityBadge severity={a.severity} />
                    </div>
                    {a.reason && (
                      <p className="mt-3 text-sm text-zinc-800">
                        <span className="font-medium">Причина:</span> {a.reason}
                      </p>
                    )}
                    {hint && (
                      <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-100">
                        <span className="font-medium text-zinc-900">Что делать. </span>
                        {hint}
                      </p>
                    )}
                    <div className="mt-3 text-xs text-zinc-500">
                      С {formatDateTime(a.raisedAt, now)} · длится{" "}
                      {formatDuration((now.getTime() - a.raisedAt.getTime()) / 1000)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Показания сейчас */}
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">Показания</h2>
            {controller.lastSummaryAt && (
              <span className="text-sm text-zinc-500">
                по сводке от {formatDateTime(controller.lastSummaryAt, now)}
              </span>
            )}
          </div>

          {zones.length === 0 ? (
            <Card className="mt-3">
              <p className="text-sm text-zinc-600">
                Сводка с показаниями ещё не приходила. Аварии уже принимаются, а показания (pH, хлор,
                температура и другие) появятся здесь, когда инженер включит ежечасную сводку.
              </p>
            </Card>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {zones.map((z) => (
                <Card key={z.zone}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{z.title}</div>
                      {z.model && <div className="text-xs text-zinc-500">станция {z.model}</div>}
                    </div>
                    {z.online === false && <StatusBadge status="offline" />}
                  </div>

                  {z.metrics.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">Показаний нет.</p>
                  ) : (
                    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {z.metrics.map((m) => {
                        const day = daySeries.get(`${z.zone}::${m.key}`);
                        const dayMin = day ? Math.min(...day.points.map((p) => p.v)) : null;
                        const dayMax = day ? Math.max(...day.points.map((p) => p.v)) : null;
                        return (
                          <div
                            key={m.key}
                            className={cn(
                              "rounded-xl px-3 py-2.5 ring-1",
                              m.outOfRange ? "bg-amber-50 ring-amber-300" : "bg-zinc-50 ring-zinc-100",
                            )}
                          >
                            <dt className="truncate text-xs text-zinc-500" title={m.label}>
                              {m.label}
                            </dt>
                            <dd className="mt-0.5 flex items-baseline gap-1">
                              <span
                                className={cn(
                                  "font-semibold tabular-nums text-zinc-900",
                                  typeof m.value === "number" ? "text-xl" : "text-sm",
                                )}
                              >
                                {m.display}
                              </span>
                              {m.unit && <span className="text-xs text-zinc-500">{m.unit}</span>}
                            </dd>
                            {m.outOfRange && (
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                <StatusIcon status="warning" className="h-3 w-3" />
                                вне ориентира {m.min !== null && formatNumber(m.min, m.digits)}–
                                {m.max !== null && formatNumber(m.max, m.digits)}
                              </div>
                            )}
                            {!m.outOfRange && dayMin !== null && dayMax !== null && dayMin !== dayMax && (
                              <div className="mt-0.5 text-[11px] tabular-nums text-zinc-400">
                                за сутки {formatNumber(dayMin, m.digits)}–{formatNumber(dayMax, m.digits)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Динамика */}
        {zones.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">Динамика</h2>
              <div className="inline-flex rounded-xl bg-zinc-100 p-1 text-sm">
                {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                  <Link
                    key={k}
                    href={`/service/monitoring/${id}?range=${k}`}
                    scroll={false}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition",
                      k === range ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
                    )}
                  >
                    {RANGES[k].label}
                  </Link>
                ))}
              </div>
            </div>

            {seriesByZone.size === 0 ? (
              <Card className="mt-3">
                <p className="text-sm text-zinc-600">
                  Графики появятся, когда за выбранный период накопится хотя бы две сводки.
                </p>
              </Card>
            ) : (
              [...seriesByZone.entries()].map(([zone, g]) => (
                <div key={zone} className="mt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{g.title}</h3>
                  <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {g.items.map((s) => {
                      const vals = s.points.map((p) => p.v);
                      const last = s.points[s.points.length - 1];
                      return (
                        <Card key={s.id} className="p-4 sm:p-5">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="text-sm font-semibold text-zinc-900">
                              {s.label}
                              {s.unit && <span className="font-normal text-zinc-500">, {s.unit}</span>}
                            </div>
                            <div className="text-xs tabular-nums text-zinc-500">
                              сейчас{" "}
                              <span className="text-sm font-semibold text-zinc-900">
                                {formatNumber(last.v, s.digits)}
                              </span>
                              {" · "}мин {formatNumber(Math.min(...vals), s.digits)} · макс{" "}
                              {formatNumber(Math.max(...vals), s.digits)}
                            </div>
                          </div>
                          <div className="mt-2">
                            <LineChart
                              points={s.points}
                              from={from.getTime()}
                              to={now.getTime()}
                              label={`${g.title}, ${s.label}`}
                              unit={s.unit}
                              digits={s.digits}
                              normMin={s.min}
                              normMax={s.max}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {/* История */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">История аварий</h2>
          {history.length === 0 ? (
            <Card className="mt-3">
              <p className="text-sm text-zinc-600">Завершённых аварий пока не было.</p>
            </Card>
          ) : (
            <>
              {/* Телефон: карточки */}
              <div className="mt-3 space-y-2 md:hidden">
                {history.map((a) => (
                  <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900">{a.title}</div>
                        {a.zoneTitle && <div className="text-xs text-zinc-500">{a.zoneTitle}</div>}
                      </div>
                      <SeverityBadge severity={a.severity} />
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {formatDateTime(a.raisedAt, now)} · длилась{" "}
                      {a.durationS !== null ? formatDuration(a.durationS) : "—"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Планшет и компьютер: таблица */}
              <Card padding="none" className="mt-3 hidden overflow-hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-5 py-3">Авария</th>
                      <th className="px-5 py-3">Где</th>
                      <th className="px-5 py-3">Началась</th>
                      <th className="px-5 py-3">Снята</th>
                      <th className="px-5 py-3">Длилась</th>
                      <th className="px-5 py-3">Важность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((a) => (
                      <tr key={a.id} className="border-b border-zinc-100 last:border-b-0">
                        <td className="px-5 py-3 font-medium text-zinc-900">
                          {a.title}
                          {a.reason && <div className="text-xs font-normal text-zinc-500">{a.reason}</div>}
                        </td>
                        <td className="px-5 py-3 text-zinc-700">{a.zoneTitle ?? "—"}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-zinc-700">{formatDateTime(a.raisedAt, now)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-zinc-700">
                          {a.clearedAt ? formatDateTime(a.clearedAt, now) : "—"}
                          {a.clearedBy === "summary" && (
                            <div className="text-xs text-zinc-400" title="Сообщение о снятии не пришло — авария закрыта по очередной сводке">
                              по сводке
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap tabular-nums text-zinc-700">
                          {a.durationS !== null ? formatDuration(a.durationS) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <SeverityBadge severity={a.severity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              {history.length === 50 && (
                <p className="mt-2 text-xs text-zinc-500">Показаны последние 50 аварий.</p>
              )}
            </>
          )}
        </section>

        {/* Для отладки с инженером — только админу */}
        {isAdmin && (
          <section className="mt-8">
            <details className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-zinc-900">
                Технический журнал: последние сообщения контроллера
                <span className="ml-2 font-normal text-zinc-500">
                  {controller.externalId} · токен …{controller.tokenHint}
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-5 py-4">
                {lastMessages.length === 0 ? (
                  <p className="text-sm text-zinc-500">Сообщений ещё не было.</p>
                ) : (
                  <ul className="space-y-3">
                    {lastMessages.map((m) => (
                      <li key={m.id}>
                        <details>
                          <summary className="cursor-pointer text-sm text-zinc-700">
                            <span className="font-mono text-xs text-zinc-500">
                              {formatDateTime(m.receivedAt, now)}
                            </span>{" "}
                            <span className="font-medium">{m.type}</span>{" "}
                            <span className="break-all font-mono text-xs text-zinc-500">{m.messageId}</span>
                          </summary>
                          <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100">
                            {JSON.stringify(m.payload, null, 2)}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </section>
        )}
      </PageContainer>
    </>
  );
}
