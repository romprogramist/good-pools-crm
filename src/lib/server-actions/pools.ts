"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Scope = "admin" | "service";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const PoolSchema = z.object({
  name: z.string().trim().min(1, "Имя обязательно").max(120),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  lat: z.string().trim().optional().or(z.literal("")),
  lng: z.string().trim().optional().or(z.literal("")),
  facingMaterials: z.string().trim().max(2000).optional().or(z.literal("")),
  extraField: z.string().trim().max(4000).optional().or(z.literal("")),
  individualServicePrice: z.string().trim().optional().or(z.literal("")),
});

function parseCoord(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDecimal(v: string | undefined): string | null {
  if (!v) return null;
  const cleaned = v.replace(",", ".").replace(/\s/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

function backToCustomer(scope: Scope, customerId: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/${scope}/customers/${customerId}${search ? "?" + search : ""}`);
}

function backToPool(
  scope: Scope,
  customerId: string,
  poolId: string,
  params: Record<string, string>,
): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/${scope}/customers/${customerId}/pools/${poolId}${search ? "?" + search : ""}`);
}

function backToNew(scope: Scope, customerId: string, error: string): never {
  redirect(`/${scope}/customers/${customerId}/pools/new?error=${encodeURIComponent(error)}`);
}

export async function createPoolAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) backToCustomer(scope, "", { error: encodeURIComponent("Не указан клиент") });

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) backToCustomer(scope, customerId, { error: encodeURIComponent("Клиент не найден") });

  const parsed = PoolSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    facingMaterials: formData.get("facingMaterials"),
    extraField: formData.get("extraField"),
    individualServicePrice: formData.get("individualServicePrice"),
  });
  if (!parsed.success) backToNew(scope, customerId, "Проверьте поля формы");

  const pool = await prisma.pool.create({
    data: {
      customerId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      lat: parseCoord(parsed.data.lat),
      lng: parseCoord(parsed.data.lng),
      facingMaterials: parsed.data.facingMaterials || null,
      extraField: parsed.data.extraField || null,
      individualServicePrice: parseDecimal(parsed.data.individualServicePrice) ?? null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "pool.create",
    entityType: "Pool",
    entityId: pool.id,
    diff: { customerId, name: pool.name, address: pool.address },
  });

  revalidatePath(`/${scope}/customers/${customerId}`);
  backToPool(scope, customerId, pool.id, { ok: encodeURIComponent("Бассейн создан") });
}

export async function updatePoolAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  if (!customerId || !poolId) {
    backToCustomer(scope, customerId, { error: encodeURIComponent("Не указан бассейн") });
  }

  const before = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!before || before.customerId !== customerId) {
    backToCustomer(scope, customerId, { error: encodeURIComponent("Бассейн не найден") });
  }

  const parsed = PoolSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    facingMaterials: formData.get("facingMaterials"),
    extraField: formData.get("extraField"),
    individualServicePrice: formData.get("individualServicePrice"),
  });
  if (!parsed.success) {
    backToPool(scope, customerId, poolId, { error: encodeURIComponent("Проверьте поля формы") });
  }

  await prisma.pool.update({
    where: { id: poolId },
    data: {
      name: parsed.data.name,
      address: parsed.data.address || null,
      lat: parseCoord(parsed.data.lat),
      lng: parseCoord(parsed.data.lng),
      facingMaterials: parsed.data.facingMaterials || null,
      extraField: parsed.data.extraField || null,
      individualServicePrice: parseDecimal(parsed.data.individualServicePrice) ?? null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "pool.update",
    entityType: "Pool",
    entityId: poolId,
    diff: {
      before: {
        name: before.name,
        address: before.address,
        lat: before.lat,
        lng: before.lng,
      },
      after: {
        name: parsed.data.name,
        address: parsed.data.address || null,
      },
    },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, { ok: encodeURIComponent("Сохранено") });
}
