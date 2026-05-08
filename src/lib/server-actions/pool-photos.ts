"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Scope = "admin" | "service";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024;
const SOFT_LIMIT_PER_POOL = 10;

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const POOL_PHOTOS_DIR = path.join(UPLOAD_ROOT, "pool-photos");

async function requireStaff() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "service")) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
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

function extOf(filename: string, mime: string) {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName) return fromName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic" || mime === "image/heif") return ".heic";
  return ".bin";
}

export async function uploadPoolPhotosAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  if (!customerId || !poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Не указан бассейн"),
    });
  }

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { id: true, customerId: true, _count: { select: { photos: true } } },
  });
  if (!pool || pool.customerId !== customerId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Бассейн не найден"),
    });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Не выбрано ни одного файла"),
    });
  }

  const dir = path.join(POOL_PHOTOS_DIR, poolId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  let saved = 0;
  let skipped = 0;
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      skipped++;
      continue;
    }
    if (file.size > MAX_BYTES) {
      skipped++;
      continue;
    }

    const ext = extOf(file.name, file.type);
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    await prisma.poolPhoto.create({
      data: {
        poolId,
        path: `pool-photos/${poolId}/${filename}`,
        originalName: file.name,
        size: file.size,
      },
    });
    saved++;
  }

  await logActivity({
    actorId: actor.id,
    action: "pool.photo.upload",
    entityType: "Pool",
    entityId: poolId,
    diff: { saved, skipped, customerId },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);

  const totalAfter = pool._count.photos + saved;
  const messages: string[] = [];
  if (saved) messages.push(`Загружено: ${saved}`);
  if (skipped) messages.push(`Пропущено: ${skipped}`);
  if (totalAfter > SOFT_LIMIT_PER_POOL) {
    messages.push(`Внимание: уже ${totalAfter} фото (рекомендовано до ${SOFT_LIMIT_PER_POOL})`);
  }
  backToPool(scope, customerId, poolId, {
    [skipped > 0 && saved === 0 ? "error" : "ok"]: encodeURIComponent(
      messages.join(". ") || "Готово",
    ),
  });
}

export async function deletePoolPhotoAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  if (!photoId || !poolId || !customerId) {
    backToPool(scope, customerId, poolId, { error: encodeURIComponent("Не указано фото") });
  }

  const photo = await prisma.poolPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.poolId !== poolId) {
    backToPool(scope, customerId, poolId, { error: encodeURIComponent("Фото не найдено") });
  }

  const filepath = path.join(UPLOAD_ROOT, photo.path);
  try {
    if (existsSync(filepath)) await unlink(filepath);
  } catch {
    // ignore disk-level failure; still drop the row
  }

  await prisma.poolPhoto.delete({ where: { id: photoId } });

  await logActivity({
    actorId: actor.id,
    action: "pool.photo.delete",
    entityType: "Pool",
    entityId: poolId,
    diff: { photoId, path: photo.path, customerId },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, { ok: encodeURIComponent("Фото удалено") });
}
