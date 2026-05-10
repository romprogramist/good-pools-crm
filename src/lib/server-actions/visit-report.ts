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
import { enqueuePush, getCustomerUserId } from "@/lib/push/stub";
import { checkVisitCanComplete } from "@/lib/visit/validation";
import { encodeChecklistValue, type ChecklistAnswerInput } from "@/lib/visit/checklist-value";

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
// 2. Сумма к оплате (autosave)
// =========================
const TotalSchema = z.object({
  visitId: z.string().min(1),
  amount: z.number().min(0).max(10_000_000),
});

export async function saveTotalAmountAction(input: {
  visitId: string;
  amount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = TotalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверная сумма" };
  }
  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
    select: { id: true, status: true },
  });
  if (!visit) return { ok: false, error: "Визит не найден" };
  if (visit.status !== "in_progress") {
    return { ok: false, error: "Сумму можно менять только во время выполнения визита" };
  }
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { totalAmount: input.amount },
  });
  return { ok: true };
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
