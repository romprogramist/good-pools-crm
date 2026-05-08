import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/Page";
import { computeEquipmentDates, daysUntil, formatDateRu } from "@/lib/equipment";

const REGULATION_WARN_DAYS = 7;
const WARRANTY_WARN_DAYS = 14;

type Scope = "admin" | "service";

type Row = {
  equipmentId: string;
  typeName: string;
  poolId: string;
  poolName: string;
  customerId: string;
  customerName: string;
  date: Date;
  days: number;
};

export async function UpcomingEquipmentWidget({ scope }: { scope: Scope }) {
  const equipment = await prisma.equipment.findMany({
    include: {
      pool: {
        select: {
          id: true,
          name: true,
          customer: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  const regulationsSoon: Row[] = [];
  const warrantiesSoon: Row[] = [];

  for (const eq of equipment) {
    const { warrantyEnd, nextRegulation } = computeEquipmentDates({
      installDate: eq.installDate,
      warrantyMonths: eq.warrantyMonths,
      regulationPeriodDays: eq.regulationPeriodDays,
      lastReplacementDate: eq.lastReplacementDate,
    });

    const base = {
      equipmentId: eq.id,
      typeName: eq.typeName,
      poolId: eq.pool.id,
      poolName: eq.pool.name,
      customerId: eq.pool.customer.id,
      customerName: eq.pool.customer.fullName,
    };

    if (nextRegulation) {
      const days = daysUntil(nextRegulation);
      if (days <= REGULATION_WARN_DAYS) {
        regulationsSoon.push({ ...base, date: nextRegulation, days });
      }
    }
    if (warrantyEnd) {
      const days = daysUntil(warrantyEnd);
      if (days <= WARRANTY_WARN_DAYS) {
        warrantiesSoon.push({ ...base, date: warrantyEnd, days });
      }
    }
  }

  regulationsSoon.sort((a, b) => a.days - b.days);
  warrantiesSoon.sort((a, b) => a.days - b.days);

  if (regulationsSoon.length === 0 && warrantiesSoon.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">
          Внимание по оборудованию
        </h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-700">
            Скоро регламент (≤ {REGULATION_WARN_DAYS} дн)
          </h3>
          <UpcomingList rows={regulationsSoon} scope={scope} kind="regulation" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-700">
            Скоро гарантия (≤ {WARRANTY_WARN_DAYS} дн)
          </h3>
          <UpcomingList rows={warrantiesSoon} scope={scope} kind="warranty" />
        </div>
      </div>
    </Card>
  );
}

function UpcomingList({
  rows,
  scope,
  kind,
}: {
  rows: Row[];
  scope: Scope;
  kind: "regulation" | "warranty";
}) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">Нет приближающихся событий.</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-zinc-100">
      {rows.map((r) => {
        const overdue = r.days < 0;
        const href = `/${scope}/customers/${r.customerId}/pools/${r.poolId}`;
        return (
          <li key={`${kind}-${r.equipmentId}`} className="py-2.5">
            <Link href={href} className="group block">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-900 group-hover:text-teal-700">
                  {r.typeName}
                </span>
                <span
                  className={
                    overdue
                      ? "text-xs font-semibold text-red-700"
                      : r.days <= 0
                        ? "text-xs font-semibold text-amber-700"
                        : "text-xs font-medium text-zinc-600"
                  }
                >
                  {formatDateRu(r.date)}
                  {overdue
                    ? ` (просрочено на ${Math.abs(r.days)} дн)`
                    : ` (через ${r.days} дн)`}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {r.customerName} → {r.poolName}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
