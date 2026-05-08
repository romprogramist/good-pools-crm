import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "narrow";
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10",
        size === "default" ? "max-w-6xl" : "max-w-md",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-zinc-500 sm:text-base">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  padding = "default",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "default" | "none";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200",
        padding === "default" && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-zinc-700"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Alert({
  variant = "info",
  children,
}: {
  variant?: "info" | "success" | "error";
  children: React.ReactNode;
}) {
  const styles = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    error: "bg-red-50 text-red-900 ring-red-200",
  }[variant];

  return (
    <div className={cn("rounded-xl px-4 py-3 text-sm ring-1", styles)}>
      {children}
    </div>
  );
}
