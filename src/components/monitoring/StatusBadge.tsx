import { cn } from "@/lib/utils";
import { STATUS_LABEL, type MonitorStatus } from "@/lib/monitoring/view";

// Статус всегда = иконка + слово, а не только цвет.
export const STATUS_STYLE: Record<
  MonitorStatus,
  { pill: string; accent: string; banner: string; iconBg: string }
> = {
  ok: {
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    accent: "bg-emerald-500",
    banner: "bg-emerald-50 ring-emerald-200 text-emerald-950",
    iconBg: "bg-emerald-500 text-white",
  },
  warning: {
    pill: "bg-amber-50 text-amber-900 ring-amber-300",
    accent: "bg-amber-500",
    banner: "bg-amber-50 ring-amber-300 text-amber-950",
    iconBg: "bg-amber-500 text-white",
  },
  critical: {
    pill: "bg-red-50 text-red-800 ring-red-300",
    accent: "bg-red-600",
    banner: "bg-red-50 ring-red-300 text-red-950",
    iconBg: "bg-red-600 text-white",
  },
  offline: {
    pill: "bg-zinc-800 text-white ring-zinc-800",
    accent: "bg-zinc-800",
    banner: "bg-zinc-100 ring-zinc-400 text-zinc-950",
    iconBg: "bg-zinc-800 text-white",
  },
  waiting: {
    pill: "bg-sky-50 text-sky-800 ring-sky-200",
    accent: "bg-sky-400",
    banner: "bg-sky-50 ring-sky-200 text-sky-950",
    iconBg: "bg-sky-500 text-white",
  },
  disabled: {
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    accent: "bg-zinc-300",
    banner: "bg-zinc-50 ring-zinc-200 text-zinc-700",
    iconBg: "bg-zinc-400 text-white",
  },
};

export function StatusIcon({ status, className }: { status: MonitorStatus; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("h-4 w-4", className),
    "aria-hidden": true,
  };
  switch (status) {
    case "ok":
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      );
    case "critical":
      return (
        <svg {...common}>
          <path d="M12 7v6" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="9.5" />
        </svg>
      );
    case "offline":
      return (
        <svg {...common}>
          <path d="M2 2l20 20" />
          <path d="M8.5 16.4a5 5 0 0 1 7 0" />
          <path d="M5 12.9a10 10 0 0 1 5.2-2.8" />
          <path d="M19 12.9a10 10 0 0 0-2.1-1.6" />
          <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />
          <path d="M22 8.8a15 15 0 0 0-11.3-3.7" />
          <path d="M12 20h.01" />
        </svg>
      );
    case "waiting":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M8 12h8" />
        </svg>
      );
  }
}

export function StatusBadge({ status, className }: { status: MonitorStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        STATUS_STYLE[status].pill,
        className,
      )}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const critical = severity === "critical";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
        critical ? STATUS_STYLE.critical.pill : STATUS_STYLE.warning.pill,
      )}
    >
      <StatusIcon status={critical ? "critical" : "warning"} className="h-3 w-3" />
      {critical ? "Критично" : "Предупреждение"}
    </span>
  );
}
