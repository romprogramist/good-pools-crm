import { createHash } from "node:crypto";
import { Prisma, type MonitoringController } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueuePush, listAdminAndServiceRecipients, type PushKind } from "@/lib/push/enqueue";
import { formatDuration, formatTime } from "./format";

export type IngestResult = { status: number; body: Record<string, unknown> };

type Rec = Record<string, unknown>;
type Notice = { kind: PushKind; payload: Record<string, unknown> };
type Tx = Prisma.TransactionClient;

const TYPE_ALIASES: Record<string, "alarm" | "summary" | "ping"> = {
  alarm: "alarm",
  summary: "summary",
  state: "summary",
  status: "summary",
  ping: "ping",
  heartbeat: "ping",
};

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 500);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function parseDate(v: unknown): Date | null {
  let d: Date | null = null;
  if (typeof v === "string" && v.trim()) d = new Date(v);
  else if (typeof v === "number" && Number.isFinite(v)) d = new Date(v < 1e12 ? v * 1000 : v);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

/** Время события по контроллеру. Часы контроллера могут врать — время из будущего не принимаем. */
function eventTime(msg: Rec, now: Date): Date {
  const d = parseDate(msg.timestamp) ?? parseDate(msg.timestamp_unix);
  if (!d) return now;
  if (d.getTime() > now.getTime() + 10 * 60 * 1000) return now;
  return d;
}

function bad(error: string, status = 400): IngestResult {
  return { status, body: { ok: false, error } };
}

type AlarmFields = {
  eventId: string | null;
  code: string | null;
  title: string | null;
  severity: "warning" | "critical";
  zone: string | null;
  zoneTitle: string | null;
  stationModel: string | null;
  stationId: string | null;
  reason: string | null;
  raisedAt: Date | null;
};

/** Понимает и формат сообщения-аварии (вложенные alarm/station), и плоский элемент active_alarms. */
function alarmFields(src: Rec): AlarmFields {
  const alarm = isRec(src.alarm) ? src.alarm : {};
  const station = isRec(src.station) ? src.station : {};
  const severity = str(alarm.severity) ?? str(src.severity);
  return {
    eventId: str(src.event_id),
    code: str(alarm.code) ?? str(src.code),
    title: str(alarm.title) ?? str(src.title),
    severity: severity?.toLowerCase() === "critical" ? "critical" : "warning",
    zone: str(station.zone) ?? str(src.zone),
    zoneTitle: str(station.zone_title) ?? str(src.zone_title),
    stationModel: str(station.model) ?? str(src.model),
    stationId: str(station.station_id) ?? str(src.station_id),
    reason: str(alarm.reason) ?? str(src.reason),
    raisedAt: parseDate(src.raised_at),
  };
}

function raisedNotice(
  controller: MonitoringController,
  alarmId: string,
  f: { title: string; zoneTitle: string | null; severity: string; reason: string | null },
): Notice {
  return {
    kind: "monitoring_alarm_raised",
    payload: {
      controllerId: controller.id,
      controllerName: controller.name,
      alarmId,
      severity: f.severity,
      title: f.title,
      zoneTitle: f.zoneTitle ?? "",
      reason: f.reason ?? "",
    },
  };
}

async function handleAlarm(
  tx: Tx,
  controller: MonitoringController,
  msg: Rec,
  at: Date,
  notices: Notice[],
): Promise<void> {
  const f = alarmFields(msg);
  const event = str(msg.event)?.toLowerCase();
  const eventId = f.eventId as string;
  const code = f.code as string;
  const title = f.title ?? code;

  const existing = await tx.monitoringAlarm.findUnique({
    where: { controllerId_eventId: { controllerId: controller.id, eventId } },
  });

  if (event === "raised") {
    if (existing) return; // повтор или уже снята — не переоткрываем
    const created = await tx.monitoringAlarm.create({
      data: {
        controllerId: controller.id,
        eventId,
        code,
        title,
        severity: f.severity,
        zone: f.zone,
        zoneTitle: f.zoneTitle,
        stationModel: f.stationModel,
        stationId: f.stationId,
        reason: f.reason,
        raisedAt: at,
      },
    });
    notices.push(raisedNotice(controller, created.id, { ...f, title }));
    return;
  }

  // cleared
  const durationFromMsg =
    typeof msg.duration_s === "number" && Number.isFinite(msg.duration_s) && msg.duration_s >= 0
      ? Math.round(msg.duration_s)
      : null;

  if (!existing) {
    // «Поднятие» до нас не дошло — восстанавливаем аварию сразу закрытой, чтобы она была в истории.
    const raisedAt =
      f.raisedAt ?? (durationFromMsg !== null ? new Date(at.getTime() - durationFromMsg * 1000) : at);
    await tx.monitoringAlarm.create({
      data: {
        controllerId: controller.id,
        eventId,
        code,
        title,
        severity: f.severity,
        zone: f.zone,
        zoneTitle: f.zoneTitle,
        stationModel: f.stationModel,
        stationId: f.stationId,
        reason: f.reason,
        raisedAt,
        clearedAt: at,
        durationS: durationFromMsg ?? Math.max(0, Math.round((at.getTime() - raisedAt.getTime()) / 1000)),
        clearedBy: "event",
      },
    });
    return;
  }
  if (existing.clearedAt) return;

  const durationS =
    durationFromMsg ?? Math.max(0, Math.round((at.getTime() - existing.raisedAt.getTime()) / 1000));
  await tx.monitoringAlarm.update({
    where: { id: existing.id },
    data: { clearedAt: at, durationS, clearedBy: "event" },
  });
  notices.push({
    kind: "monitoring_alarm_cleared",
    payload: {
      controllerId: controller.id,
      controllerName: controller.name,
      alarmId: existing.id,
      title: existing.title,
      zoneTitle: existing.zoneTitle ?? "",
      duration: formatDuration(durationS),
    },
  });
}

async function handleSummary(
  tx: Tx,
  controller: MonitoringController,
  msg: Rec,
  at: Date,
  notices: Notice[],
): Promise<void> {
  await tx.monitoringReading.create({
    data: { controllerId: controller.id, at, payload: msg as Prisma.InputJsonValue },
  });

  // Сверка: сводка — источник правды о том, какие аварии активны прямо сейчас.
  // Так потерянное сообщение raised/cleared не оставит CRM в неверном состоянии.
  if (!Array.isArray(msg.active_alarms)) return;

  const active = msg.active_alarms.filter(isRec).map(alarmFields).filter((a) => a.eventId && a.code);
  const activeIds = new Set(active.map((a) => a.eventId as string));

  for (const a of active) {
    const eventId = a.eventId as string;
    const exists = await tx.monitoringAlarm.findUnique({
      where: { controllerId_eventId: { controllerId: controller.id, eventId } },
      select: { id: true },
    });
    if (exists) continue;
    const title = a.title ?? (a.code as string);
    const created = await tx.monitoringAlarm.create({
      data: {
        controllerId: controller.id,
        eventId,
        code: a.code as string,
        title,
        severity: a.severity,
        zone: a.zone,
        zoneTitle: a.zoneTitle,
        stationModel: a.stationModel,
        stationId: a.stationId,
        reason: a.reason,
        raisedAt: a.raisedAt && a.raisedAt <= at ? a.raisedAt : at,
      },
    });
    notices.push(raisedNotice(controller, created.id, { ...a, title }));
  }

  const open = await tx.monitoringAlarm.findMany({
    where: { controllerId: controller.id, clearedAt: null, raisedAt: { lt: at } },
  });
  for (const o of open) {
    if (activeIds.has(o.eventId)) continue;
    const durationS = Math.max(0, Math.round((at.getTime() - o.raisedAt.getTime()) / 1000));
    await tx.monitoringAlarm.update({
      where: { id: o.id },
      data: { clearedAt: at, durationS, clearedBy: "summary" },
    });
    notices.push({
      kind: "monitoring_alarm_cleared",
      payload: {
        controllerId: controller.id,
        controllerName: controller.name,
        alarmId: o.id,
        title: o.title,
        zoneTitle: o.zoneTitle ?? "",
        duration: formatDuration(durationS),
      },
    });
  }
}

export async function ingestMonitoringMessage(
  controller: MonitoringController,
  raw: unknown,
): Promise<IngestResult> {
  if (!isRec(raw)) return bad("Тело запроса должно быть JSON-объектом");

  const claimedId = str(raw.controller_id);
  if (claimedId && claimedId !== controller.externalId) {
    return bad(
      `controller_id "${claimedId}" не совпадает с контроллером этого токена (${controller.externalId})`,
      403,
    );
  }

  const rawType = str(raw.type)?.toLowerCase() ?? "";
  const type = TYPE_ALIASES[rawType];
  if (!type) return bad(`Неизвестный type "${rawType}". Допустимо: alarm, summary, ping`);

  if (type === "alarm") {
    const f = alarmFields(raw);
    const event = str(raw.event)?.toLowerCase();
    if (event !== "raised" && event !== "cleared") return bad('В аварии нужно поле event: "raised" или "cleared"');
    if (!f.eventId) return bad("В аварии нужно поле event_id");
    if (!f.code) return bad("В аварии нужно поле alarm.code");
  }

  const now = new Date();
  const at = eventTime(raw, now);
  const messageId =
    str(raw.message_id) ?? `auto-${createHash("sha256").update(JSON.stringify(raw)).digest("hex").slice(0, 32)}`;

  const notices: Notice[] = [];
  const wasOfflineNotified = controller.offlineNotifiedAt !== null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.monitoringMessage.create({
        data: {
          controllerId: controller.id,
          messageId,
          type,
          payload: raw as Prisma.InputJsonValue,
        },
      });

      if (type === "alarm") await handleAlarm(tx, controller, raw, at, notices);
      if (type === "summary") await handleSummary(tx, controller, raw, at, notices);

      await tx.monitoringController.update({
        where: { id: controller.id },
        data: {
          lastSeenAt: now,
          offlineNotifiedAt: null,
          ...(type === "summary"
            ? { lastSummaryAt: at, lastSummary: raw as Prisma.InputJsonValue, expectHeartbeat: true }
            : {}),
          ...(type === "ping" ? { expectHeartbeat: true } : {}),
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Повторная доставка того же message_id — уже обработано. Но контроллер жив: отметим связь.
      await prisma.monitoringController.update({
        where: { id: controller.id },
        data: { lastSeenAt: now },
      });
      return { status: 200, body: { ok: true, duplicate: true, message_id: messageId } };
    }
    throw err;
  }

  if (wasOfflineNotified) {
    notices.unshift({
      kind: "monitoring_online",
      payload: { controllerId: controller.id, controllerName: controller.name, time: formatTime(now) },
    });
  }

  if (notices.length > 0) {
    const recipients = await listAdminAndServiceRecipients();
    for (const n of notices) {
      await enqueuePush(n.kind, recipients, n.payload).catch((err) => {
        console.error("[monitoring] enqueuePush failed", { kind: n.kind, err });
      });
    }
  }

  return {
    status: 200,
    body: { ok: true, received: type, message_id: messageId, server_time: now.toISOString() },
  };
}
