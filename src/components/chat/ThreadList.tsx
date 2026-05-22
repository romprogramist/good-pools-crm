import Link from "next/link";
import { Card } from "@/components/Page";
import { formatMoscow } from "@/lib/calendar/dates";
import type { StaffThreadRow } from "@/lib/chat";

export function ThreadList({
  threads,
  basePath,
}: {
  threads: StaffThreadRow[];
  basePath: string;
}) {
  if (threads.length === 0) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-zinc-500">Обращений в поддержку пока нет.</p>
      </Card>
    );
  }

  return (
    <Card padding="none" className="mt-6 overflow-hidden">
      <ul>
        {threads.map((t) => (
          <li
            key={t.id}
            className="border-b border-zinc-100 last:border-b-0"
          >
            <Link
              href={`${basePath}/${t.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-zinc-50/60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">
                    {t.customerName}
                  </span>
                  {t.unread > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t.unread}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-sm text-zinc-500">
                  {t.lastMessage || "—"}
                </div>
              </div>
              <div className="shrink-0 text-xs text-zinc-400">
                {formatMoscow(t.lastAt)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
