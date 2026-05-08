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

function backWithError(scope: Scope, customerId: string, error: string): never {
  const url = new URL(`/${scope}/customers/${customerId}`, "http://x");
  url.searchParams.set("error", error);
  redirect(url.pathname + url.search);
}

function backWithOk(scope: Scope, customerId: string, ok: string): never {
  const url = new URL(`/${scope}/customers/${customerId}`, "http://x");
  url.searchParams.set("ok", ok);
  redirect(url.pathname + url.search);
}

const CustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  legalInfo: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function updateCustomerAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) backWithError(scope, "", "Не указан клиент");

  const parsed = CustomerSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    legalInfo: formData.get("legalInfo"),
  });
  if (!parsed.success) backWithError(scope, customerId, "Проверьте поля формы");

  const before = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!before) backWithError(scope, customerId, "Клиент не найден");

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      legalInfo: parsed.data.legalInfo || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "customer.update",
    entityType: "Customer",
    entityId: customerId,
    diff: {
      before: {
        fullName: before.fullName,
        phone: before.phone,
        email: before.email,
        legalInfo: before.legalInfo,
      },
      after: {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        legalInfo: parsed.data.legalInfo || null,
      },
    },
  });

  revalidatePath(`/${scope}/customers/${customerId}`);
  backWithOk(scope, customerId, "Сохранено");
}

export async function deletePoolAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  if (!poolId || !customerId) backWithError(scope, customerId, "Не указан бассейн");

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { id: true, name: true, customerId: true },
  });
  if (!pool || pool.customerId !== customerId) {
    backWithError(scope, customerId, "Бассейн не найден");
  }

  await prisma.pool.delete({ where: { id: poolId } });

  await logActivity({
    actorId: actor.id,
    action: "pool.delete",
    entityType: "Pool",
    entityId: poolId,
    diff: { name: pool.name, customerId },
  });

  revalidatePath(`/${scope}/customers/${customerId}`);
  backWithOk(scope, customerId, "Бассейн удалён");
}
