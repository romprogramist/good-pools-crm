import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Alert } from "@/components/Page";
import { PoolForm } from "@/components/pools/PoolForm";
import { PoolPhotos } from "@/components/pools/PoolPhotos";
import { PoolInstructions } from "@/components/pools/PoolInstructions";
import { PoolEquipment } from "@/components/pools/PoolEquipment";
import { getMapsApiKey } from "@/lib/maps";

type Scope = "admin" | "service";

export async function PoolDetail({
  scope,
  customerId,
  poolId,
  ok,
  error,
}: {
  scope: Scope;
  customerId: string;
  poolId: string;
  ok?: string;
  error?: string;
}) {
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: {
      customer: { select: { id: true, fullName: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
      instructions: { orderBy: { createdAt: "asc" } },
      equipment: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!pool || pool.customerId !== customerId) notFound();

  const equipmentTemplates = await prisma.equipmentTemplate.findMany({
    where: { active: true },
    orderBy: { typeName: "asc" },
    select: {
      id: true,
      typeName: true,
      defaultWarrantyMonths: true,
      regulationPeriodDays: true,
    },
  });

  const mapsKey = getMapsApiKey();
  const customerHref = `/${scope}/customers/${customerId}`;
  const hasCoords = pool.lat != null && pool.lng != null;
  const routeUrl = hasCoords
    ? `https://yandex.ru/maps/?rtext=~${pool.lat},${pool.lng}&rtt=auto`
    : pool.address
      ? `https://yandex.ru/maps/?rtext=~${encodeURIComponent(pool.address)}&rtt=auto`
      : null;

  return (
    <>
      <PageHeader
        title={pool.name}
        subtitle={
          <>
            Клиент:{" "}
            <Link href={customerHref} className="font-medium text-teal-700 hover:text-teal-800">
              {pool.customer.fullName}
            </Link>
          </>
        }
        actions={
          <>
            <Link
              href={customerHref}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              ← К клиенту
            </Link>
            {routeUrl ? (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  hasCoords
                    ? "Маршрут до точки на карте"
                    : "Маршрут по адресу (точные координаты не заданы)"
                }
                className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                Построить маршрут →
              </a>
            ) : (
              <span
                title="Укажите адрес или координаты, чтобы построить маршрут"
                className="inline-flex h-10 cursor-not-allowed items-center rounded-lg bg-zinc-200 px-4 text-sm font-medium text-zinc-500"
              >
                Маршрут недоступен
              </span>
            )}
          </>
        }
      />

      <div className="mt-6 space-y-4">
        {ok && <Alert variant="success">{decodeURIComponent(ok)}</Alert>}
        {error && <Alert variant="error">{decodeURIComponent(error)}</Alert>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <Card>
          <h2 className="text-base font-semibold text-zinc-900">Параметры бассейна</h2>
          <div className="mt-5">
            <PoolForm
              scope={scope}
              customerId={customerId}
              mapsApiKey={mapsKey}
              cancelHref={customerHref}
              initial={{
                id: pool.id,
                name: pool.name,
                address: pool.address,
                lat: pool.lat,
                lng: pool.lng,
                facingMaterials: pool.facingMaterials,
                extraField: pool.extraField,
                individualServicePrice: pool.individualServicePrice
                  ? pool.individualServicePrice.toString()
                  : null,
              }}
            />
          </div>
        </Card>

        <PoolPhotos
          scope={scope}
          customerId={customerId}
          poolId={pool.id}
          photos={pool.photos.map((p) => ({
            id: p.id,
            filename: p.path.split("/").pop() ?? "",
          }))}
        />

        <PoolEquipment
          scope={scope}
          customerId={customerId}
          poolId={pool.id}
          templates={equipmentTemplates}
          equipment={pool.equipment.map((e) => ({
            id: e.id,
            typeName: e.typeName,
            serial: e.serial,
            installDate: e.installDate.toISOString(),
            warrantyMonths: e.warrantyMonths,
            regulationPeriodDays: e.regulationPeriodDays,
            lastReplacementDate: e.lastReplacementDate
              ? e.lastReplacementDate.toISOString()
              : null,
            notes: e.notes,
          }))}
        />

        <PoolInstructions
          scope={scope}
          customerId={customerId}
          poolId={pool.id}
          instructions={pool.instructions.map((i) => ({
            id: i.id,
            kind: i.kind,
            title: i.title,
            content: i.content,
            path: i.path,
            url: i.url,
          }))}
        />
      </div>
    </>
  );
}
