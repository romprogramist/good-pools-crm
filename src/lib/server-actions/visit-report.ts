"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import type { ChecklistQuestionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { enqueuePush, getCustomerUserId } from "@/lib/push/enqueue";
import { checkVisitCanComplete } from "@/lib/visit/validation";
import { encodeChecklistValue, type ChecklistAnswerInput } from "@/lib/visit/checklist-value";
import { generateVisitPdf } from "@/lib/pdf/generate-visit-pdf";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const VISIT_PHOTOS_DIR = path.join(UPLOAD_ROOT, "visit-photos");
const REPORTS_PDF_DIR = path.join(UPLOAD_ROOT, "reports-pdf");

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 2000;
const SERVICE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireStaff() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "admin" && session.user.role !== "service")
  ) {
    throw new Error("Доступ запрещён");
  }
  return session.user;
}

async function loadVisitOrThrow(visitId: string) {
  const visit = await prisma.visit.findUnique({ where: { id: visitId } });
  if (!visit) throw new Error("Визит не найден");
  return visit;
}

// =========================
// 1. Старт визита
// =========================
export async function startVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "planned") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не в статусе planned")}`);
  }
  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "in_progress", startedAt: new Date() },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.started",
    entityType: "Visit",
    entityId: visitId,
  });
  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит начат")}`);
}

// =========================
// 2. Авто-пересчёт суммы визита (доп.работы + химия)
// =========================
async function recomputeVisitTotal(visitId: string): Promise<number> {
  const [works, chems] = await Promise.all([
    prisma.visitExtraWork.findMany({ where: { visitId }, select: { price: true } }),
    prisma.visitChemistry.findMany({
      where: { visitId },
      select: { priceAtMoment: true, qty: true },
    }),
  ]);
  const worksSum = works.reduce((s, w) => s + Number(w.price), 0);
  const chemSum = chems.reduce(
    (s, c) => s + Number(c.priceAtMoment) * Number(c.qty),
    0,
  );
  const total = Math.round((worksSum + chemSum) * 100) / 100;
  await prisma.visit.update({
    where: { id: visitId },
    data: { totalAmount: total },
  });
  return total;
}

// =========================
// 3. Переоткрыть завершённый визит
// =========================
export async function reopenVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "completed") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не завершён")}`);
  }

  const isAdmin = actor.role === "admin";
  if (!isAdmin) {
    if (visit.serviceUserId !== actor.id) {
      redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Можно править только свой визит")}`);
    }
    if (
      !visit.completedAt ||
      Date.now() - visit.completedAt.getTime() > SERVICE_EDIT_WINDOW_MS
    ) {
      redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Окно редактирования (24ч) истекло")}`);
    }
  }

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "in_progress", completedAt: null },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.reopened",
    entityType: "Visit",
    entityId: visitId,
  });
  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит переоткрыт")}`);
}

// =========================
// 4. Сохранение ответа чек-листа (autosave per field)
// =========================
const ChecklistAnswerSchema = z.object({
  visitId: z.string().min(1),
  questionId: z.string().min(1),
  type: z.enum(["text", "number", "single_select", "multi_select", "bool"]),
  // value валидируется ниже по type-discriminator
  value: z.unknown(),
});

export async function saveChecklistAnswerAction(input: {
  visitId: string;
  questionId: string;
  type: ChecklistQuestionType;
  value: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = ChecklistAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверный ввод" };
  }

  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
    select: { id: true, status: true },
  });
  if (!visit) return { ok: false, error: "Визит не найден" };
  if (visit.status !== "in_progress") {
    return { ok: false, error: "Чек-лист редактируется только во время выполнения" };
  }

  // Нормализация по типу
  let answer: ChecklistAnswerInput;
  switch (input.type) {
    case "text":
      answer = { type: "text", value: typeof input.value === "string" ? input.value : "" };
      break;
    case "number":
      answer = { type: "number", value: typeof input.value === "string" ? input.value : "" };
      break;
    case "single_select":
      answer = {
        type: "single_select",
        value: typeof input.value === "string" ? input.value : "",
      };
      break;
    case "multi_select":
      answer = {
        type: "multi_select",
        value: Array.isArray(input.value) ? (input.value as string[]) : [],
      };
      break;
    case "bool":
      answer = { type: "bool", value: input.value === true };
      break;
  }

  const encoded = encodeChecklistValue(answer);

  await prisma.visitChecklistAnswer.upsert({
    where: {
      visitId_questionId: {
        visitId: input.visitId,
        questionId: input.questionId,
      },
    },
    create: {
      visitId: input.visitId,
      questionId: input.questionId,
      value: encoded as never,
    },
    update: { value: encoded as never },
  });

  return { ok: true };
}

// =========================
// 5. Загрузка/удаление фото визита
// =========================
function extOf(filename: string, mime: string) {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName) return fromName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic" || mime === "image/heif") return ".heic";
  return ".bin";
}

export async function uploadVisitPhotosAction(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const visitId = String(formData.get("visitId") ?? "");
  if (!visitId) {
    redirect(`/service/calendar?error=${encodeURIComponent("Не указан визит")}`);
  }
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { id: true, status: true },
  });
  if (!visit) {
    redirect(`/service/calendar?error=${encodeURIComponent("Визит не найден")}`);
  }
  if (visit.status !== "in_progress") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Фото можно добавлять только во время выполнения")}`);
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Нет файлов")}`);
  }

  const dir = path.join(VISIT_PHOTOS_DIR, visitId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  let saved = 0;
  let skipped = 0;
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      skipped++;
      continue;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      skipped++;
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer() as ArrayBuffer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let outBuffer: Buffer = buffer as any;
    let outExt = ".jpg";
    let width: number | null = null;
    let height: number | null = null;

    try {
      const img = sharp(buffer).rotate(); // авто-ориентация по EXIF
      const meta = await img.metadata();
      const needsResize =
        (meta.width ?? 0) > PHOTO_MAX_DIMENSION ||
        (meta.height ?? 0) > PHOTO_MAX_DIMENSION;
      const resized = needsResize
        ? img.resize({
            width: PHOTO_MAX_DIMENSION,
            height: PHOTO_MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
        : img;
      outBuffer = await resized.jpeg({ quality: 85 }).toBuffer();
      const finalMeta = await sharp(outBuffer).metadata();
      width = finalMeta.width ?? null;
      height = finalMeta.height ?? null;
    } catch {
      // Если sharp не справился (HEIC без libvips и т.п.) — сохраняем оригинал
      outBuffer = buffer;
      outExt = extOf(file.name, file.type);
    }

    const filename = `${randomUUID()}${outExt}`;
    const filepath = path.join(dir, filename);
    await writeFile(filepath, outBuffer);

    await prisma.visitPhoto.create({
      data: {
        visitId,
        path: `visit-photos/${visitId}/${filename}`,
        originalName: file.name,
        size: outBuffer.length,
        width,
        height,
      },
    });
    saved++;
  }

  await logActivity({
    actorId: actor.id,
    action: "visit.photo.upload",
    entityType: "Visit",
    entityId: visitId,
    diff: { saved, skipped },
  });

  revalidatePath(`/service/visits/${visitId}`);

  const messages: string[] = [];
  if (saved) messages.push(`Загружено: ${saved}`);
  if (skipped) messages.push(`Пропущено: ${skipped}`);
  redirect(
    `/service/visits/${visitId}?${
      skipped > 0 && saved === 0 ? "error" : "ok"
    }=${encodeURIComponent(messages.join(". ") || "Готово")}`,
  );
}

export async function deleteVisitPhotoAction(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const visitId = String(formData.get("visitId") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  if (!visitId || !photoId) {
    redirect(`/service/calendar?error=${encodeURIComponent("Нет данных")}`);
  }

  const photo = await prisma.visitPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.visitId !== visitId) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Фото не найдено")}`);
  }

  const filepath = path.join(UPLOAD_ROOT, photo.path);
  try {
    if (existsSync(filepath)) await unlink(filepath);
  } catch {
    // ignore
  }

  await prisma.visitPhoto.delete({ where: { id: photoId } });

  await logActivity({
    actorId: actor.id,
    action: "visit.photo.delete",
    entityType: "Visit",
    entityId: visitId,
    diff: { photoId, path: photo.path },
  });

  revalidatePath(`/service/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Фото удалено")}`);
}

// =========================
// 6. Доп.работы (CRUD)
// =========================
const ExtraWorkSchema = z.object({
  visitId: z.string().min(1),
  name: z.string().trim().min(1, "Название обязательно").max(200),
  price: z.number().min(0).max(10_000_000),
});

async function ensureInProgress(visitId: string): Promise<void> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { status: true },
  });
  if (!visit) throw new Error("Визит не найден");
  if (visit.status !== "in_progress") {
    throw new Error("Редактирование возможно только во время выполнения");
  }
}

export async function addExtraWorkAction(input: {
  visitId: string;
  name: string;
  price: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const parsed = ExtraWorkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  try {
    await ensureInProgress(input.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }

  const last = await prisma.visitExtraWork.findFirst({
    where: { visitId: input.visitId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.visitExtraWork.create({
    data: {
      visitId: input.visitId,
      name: parsed.data.name,
      price: parsed.data.price,
      order: nextOrder,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.create",
    entityType: "Visit",
    entityId: input.visitId,
    diff: { id: created.id, name: created.name, price: created.price.toString() },
  });

  await recomputeVisitTotal(input.visitId);
  revalidatePath(`/service/visits/${input.visitId}`);
  return { ok: true, id: created.id };
}

export async function updateExtraWorkAction(input: {
  id: string;
  name: string;
  price: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!input.id) return { ok: false, error: "Нет id" };
  const existing = await prisma.visitExtraWork.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  const parsed = ExtraWorkSchema.safeParse({
    visitId: existing.visitId,
    name: input.name,
    price: input.price,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  await prisma.visitExtraWork.update({
    where: { id: input.id },
    data: { name: parsed.data.name, price: parsed.data.price },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.update",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: {
      id: input.id,
      before: { name: existing.name, price: existing.price.toString() },
      after: { name: parsed.data.name, price: parsed.data.price },
    },
  });
  await recomputeVisitTotal(existing.visitId);
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

export async function deleteExtraWorkAction(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const existing = await prisma.visitExtraWork.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  await prisma.visitExtraWork.delete({ where: { id: input.id } });
  await logActivity({
    actorId: actor.id,
    action: "visit.extra_work.delete",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, name: existing.name, price: existing.price.toString() },
  });
  await recomputeVisitTotal(existing.visitId);
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

// =========================
// 7. Химия — список доступных позиций (для Combobox)
// =========================
export async function listActiveChemistryItems() {
  await requireStaff();
  return prisma.chemistryItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, price: true },
  });
}

// =========================
// 8. Химия в визите (CRUD)
// =========================
const VisitChemistrySchema = z.object({
  visitId: z.string().min(1),
  chemistryItemId: z.string().min(1),
  qty: z.number().min(0.001).max(10_000),
});

export async function addVisitChemistryAction(input: {
  visitId: string;
  chemistryItemId: string;
  qty: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const parsed = VisitChemistrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  try {
    await ensureInProgress(input.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }

  const item = await prisma.chemistryItem.findUnique({
    where: { id: input.chemistryItemId },
  });
  if (!item || !item.active) {
    return { ok: false, error: "Позиция химии не найдена или неактивна" };
  }

  const last = await prisma.visitChemistry.findFirst({
    where: { visitId: input.visitId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.visitChemistry.create({
    data: {
      visitId: input.visitId,
      chemistryItemId: item.id,
      nameAtMoment: item.name,
      unitAtMoment: item.unit,
      priceAtMoment: item.price,
      qty: parsed.data.qty,
      order: nextOrder,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.add",
    entityType: "Visit",
    entityId: input.visitId,
    diff: {
      id: created.id,
      name: item.name,
      qty: parsed.data.qty,
      priceAtMoment: item.price.toString(),
    },
  });
  await recomputeVisitTotal(input.visitId);
  revalidatePath(`/service/visits/${input.visitId}`);
  return { ok: true, id: created.id };
}

export async function updateVisitChemistryQtyAction(input: {
  id: string;
  qty: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!input.id) return { ok: false, error: "Нет id" };
  const existing = await prisma.visitChemistry.findUnique({
    where: { id: input.id },
  });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  if (input.qty <= 0 || input.qty > 10_000) {
    return { ok: false, error: "Количество должно быть > 0 и ≤ 10000" };
  }
  await prisma.visitChemistry.update({
    where: { id: input.id },
    data: { qty: input.qty },
  });
  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.update",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, before: existing.qty.toString(), after: input.qty },
  });
  await recomputeVisitTotal(existing.visitId);
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

export async function deleteVisitChemistryAction(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireStaff();
  const existing = await prisma.visitChemistry.findUnique({
    where: { id: input.id },
  });
  if (!existing) return { ok: false, error: "Запись не найдена" };
  try {
    await ensureInProgress(existing.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  await prisma.visitChemistry.delete({ where: { id: input.id } });
  await logActivity({
    actorId: actor.id,
    action: "visit.chemistry.delete",
    entityType: "Visit",
    entityId: existing.visitId,
    diff: { id: input.id, name: existing.nameAtMoment, qty: existing.qty.toString() },
  });
  await recomputeVisitTotal(existing.visitId);
  revalidatePath(`/service/visits/${existing.visitId}`);
  return { ok: true };
}

// =========================
// 9. Завершение визита
// =========================
export async function completeVisitAction(visitId: string): Promise<void> {
  const actor = await requireStaff();
  const visit = await loadVisitOrThrow(visitId);
  if (visit.status !== "in_progress") {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent("Визит не в статусе in_progress")}`);
  }

  const check = await checkVisitCanComplete(visitId);
  if (!check.ok) {
    redirect(`/service/visits/${visitId}?error=${encodeURIComponent(check.errors.join("; "))}`);
  }

  const wasCompletedBefore = !!visit.pdfGeneratedAt;

  // Финальный пересчёт суммы перед фиксацией статуса
  const finalTotal = await recomputeVisitTotal(visitId);

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "completed", completedAt: new Date() },
  });

  await generateVisitPdf(visitId);

  await logActivity({
    actorId: actor.id,
    action: "visit.completed",
    entityType: "Visit",
    entityId: visitId,
    diff: {
      totalAmount: finalTotal,
      photoCount: check.photoCount,
      reopened: wasCompletedBefore,
    },
  });

  // Push клиенту
  const visitWithPool = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      scheduledAt: true,
      pool: { select: { name: true, customer: { select: { id: true } } } },
    },
  });
  if (visitWithPool) {
    const userId = await getCustomerUserId(visitWithPool.pool.customer.id);
    if (userId) {
      const totalLabel = `${finalTotal} ₽`;
      const summary = `${new Date(visitWithPool.scheduledAt).toLocaleDateString("ru-RU")} — ${visitWithPool.pool.name}`;
      await enqueuePush(
        wasCompletedBefore ? "visit_report_updated" : "visit_report_ready",
        [{ userId }],
        { visitId, totalLabel, summary },
      );
    }
  }

  revalidatePath(`/service/visits/${visitId}`);
  revalidatePath(`/client/visits/${visitId}`);
  redirect(`/service/visits/${visitId}?ok=${encodeURIComponent("Визит завершён, PDF готов")}`);
}
