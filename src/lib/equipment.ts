export type EquipmentDates = {
  warrantyEnd: Date | null;
  nextRegulation: Date | null;
};

export function computeEquipmentDates(eq: {
  installDate: Date;
  warrantyMonths: number;
  regulationPeriodDays: number;
  lastReplacementDate: Date | null;
}): EquipmentDates {
  const warrantyEnd =
    eq.warrantyMonths > 0
      ? addMonths(eq.installDate, eq.warrantyMonths)
      : null;

  const nextRegulation =
    eq.regulationPeriodDays > 0
      ? addDays(eq.lastReplacementDate ?? eq.installDate, eq.regulationPeriodDays)
      : null;

  return { warrantyEnd, nextRegulation };
}

export function addMonths(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) {
    result.setDate(0);
  }
  return result;
}

export function addDays(d: Date, days: number): Date {
  const result = new Date(d.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function daysUntil(target: Date, now: Date = new Date()): number {
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatDateRu(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toInputDate(d: Date | null | undefined): string {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
