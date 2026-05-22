"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

const ChemistrySchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(160),
  unit: z.string().trim().min(1, "Единица обязательна").max(32),
  price: z.coerce
    .number()
    .min(0, "Цена не может быть отрицательной")
    .max(10_000_000),
});

function back(params: Record<string, string>): never {
  const search = new URLSearchParams(params).toString();
  redirect(`/admin/chemistry${search ? "?" + search : ""}`);
}

export async function createChemistryAction(formData: FormData) {
  const actor = await requireAdmin();

  const parsed = ChemistrySchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    back({ error: encodeURIComponent("Проверьте поля формы") });
  }

  const item = await prisma.chemistryItem.create({
    data: {
      name: parsed.data.name,
      unit: parsed.data.unit,
      price: parsed.data.price,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "chemistry.create",
    entityType: "ChemistryItem",
    entityId: item.id,
    diff: {
      name: item.name,
      unit: item.unit,
      price: item.price.toString(),
    },
  });

  revalidatePath("/admin/chemistry");
  back({ ok: encodeURIComponent("Позиция добавлена") });
}

export async function updateChemistryAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) back({ error: encodeURIComponent("Не указана позиция") });

  const before = await prisma.chemistryItem.findUnique({ where: { id } });
  if (!before) back({ error: encodeURIComponent("Позиция не найдена") });

  const parsed = ChemistrySchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    back({ error: encodeURIComponent("Проверьте поля формы") });
  }

  await prisma.chemistryItem.update({
    where: { id },
    data: {
      name: parsed.data.name,
      unit: parsed.data.unit,
      price: parsed.data.price,
    },
  });

  const priceChanged = before.price.toString() !== parsed.data.price.toString();

  await logActivity({
    actorId: actor.id,
    action: "chemistry.update",
    entityType: "ChemistryItem",
    entityId: id,
    diff: {
      priceChanged,
      before: {
        name: before.name,
        unit: before.unit,
        price: before.price.toString(),
      },
      after: {
        name: parsed.data.name,
        unit: parsed.data.unit,
        price: parsed.data.price.toString(),
      },
    },
  });

  revalidatePath("/admin/chemistry");
  back({ ok: encodeURIComponent("Сохранено") });
}

export async function setChemistryActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) back({ error: encodeURIComponent("Не указана позиция") });

  const item = await prisma.chemistryItem.findUnique({ where: { id } });
  if (!item) back({ error: encodeURIComponent("Позиция не найдена") });

  await prisma.chemistryItem.update({ where: { id }, data: { active } });

  await logActivity({
    actorId: actor.id,
    action: active ? "chemistry.activate" : "chemistry.deactivate",
    entityType: "ChemistryItem",
    entityId: id,
  });

  revalidatePath("/admin/chemistry");
  back({
    ok: encodeURIComponent(active ? "Позиция активирована" : "Позиция скрыта"),
  });
}
