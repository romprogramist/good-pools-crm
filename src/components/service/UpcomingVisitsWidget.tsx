import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/Page";
import { formatMoscow } from "@/lib/calendar/dates";

export async function UpcomingVisitsWidget() {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const visits = await prisma.visit.findMany({
    where: {
      status: "planned",
      scheduledAt: { gte: now, lte: in7d },
    },
    orderBy: { scheduledAt: "asc" },
    take: 3,
    include: {
      pool: { select: { name: true, customer: { select: { fullName: true } } } },
      serviceUser: { select: { name: true } },
    },
  });

  if (visits.length === 0) return null;

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-zinc-900">Ближайшие визиты</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {visits.map((v) => (
          <li key={v.id}>
            <Link
              href={`/service/visits/${v.id}`}
              className="flex flex-wrap items-baseline gap-2 rounded-md px-2 py-1 text-sm hover:bg-zinc-50"
            >
              <span className="font-medium">{formatMoscow(v.scheduledAt)}</span>
              <span className="text-zinc-700">
                {v.pool.customer.fullName} — {v.pool.name}
              </span>
              <span className="text-xs text-zinc-500">{v.serviceUser.name ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
