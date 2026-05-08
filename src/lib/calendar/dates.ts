import { addDays, addMonths } from "@/lib/equipment";

export type Recurrence = "weekly" | "biweekly" | "monthly";

export function generateOccurrenceDates(
  startAt: Date,
  recurrence: Recurrence,
  occurrences: number,
): Date[] {
  const result: Date[] = [];
  for (let i = 0; i < occurrences; i++) {
    if (recurrence === "weekly") {
      result.push(addDays(startAt, i * 7));
    } else if (recurrence === "biweekly") {
      result.push(addDays(startAt, i * 14));
    } else {
      result.push(addMonths(startAt, i));
    }
  }
  return result;
}

const MOSCOW_TZ = "Europe/Moscow";

export function formatMoscow(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: MOSCOW_TZ,
  }).format(date);
}

export function formatMoscowDate(date: Date): string {
  return formatMoscow(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatMoscowTime(date: Date): string {
  return formatMoscow(date, { hour: "2-digit", minute: "2-digit" });
}

// Parse "YYYY-MM-DDTHH:mm" from <input type="datetime-local"> as Europe/Moscow,
// return a UTC Date.
export function parseMoscowLocalDateTime(input: string): Date {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) throw new Error("Неверный формат даты-времени");
  const [, y, mo, d, h, mi] = m;
  // Europe/Moscow is UTC+3 без перехода на летнее (с 2014).
  // localTime in Moscow = utcTime + 3h, so utcTime = localTime - 3h.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 3, +mi, 0, 0);
  return new Date(utcMs);
}

// Format UTC Date to "YYYY-MM-DDTHH:mm" string в Europe/Moscow для <input type="datetime-local">.
export function formatMoscowLocalDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
