const TZ = "Europe/Moscow";

const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

/** «сегодня, 14:05» / «вчера, 09:30» / «17 нояб., 18:20» — всегда по Москве. */
export function formatDateTime(d: Date, now: Date = new Date()): string {
  const key = dayKeyFmt.format(d);
  if (key === dayKeyFmt.format(now)) return `сегодня, ${formatTime(d)}`;
  if (key === dayKeyFmt.format(new Date(now.getTime() - 86_400_000))) return `вчера, ${formatTime(d)}`;
  return dateTimeFmt.format(d).replace(" г.", "");
}

/** «12 мин», «1 ч 5 мин», «2 дн 3 ч». */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return "меньше минуты";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} ч ${m % 60} мин` : `${h} ч`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} дн ${h % 24} ч` : `${d} дн`;
}

export function formatAgo(d: Date, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 90) return "только что";
  return `${formatDuration(s)} назад`;
}
