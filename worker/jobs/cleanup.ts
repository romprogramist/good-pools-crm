import path from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import type { JobResult } from "../run-job";
import { addDays, startOfDay } from "../date-utils";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const CLEANUP_AFTER_DAYS = 90;
const BATCH_SIZE = 200;

async function unlinkSilent(relPath: string): Promise<boolean> {
  const full = path.join(UPLOAD_ROOT, relPath);
  try {
    await unlink(full);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    console.error("[cron] cleanup: unlink failed", { path: full, err });
    return false;
  }
}

export async function cleanupJob(): Promise<JobResult> {
  const cutoff = addDays(startOfDay(new Date()), -CLEANUP_AFTER_DAYS);

  let visitDeleted = 0;
  let visitMissing = 0;
  let chatDeleted = 0;
  let chatMissing = 0;

  // VisitPhoto
  for (;;) {
    const batch = await prisma.visitPhoto.findMany({
      where: { uploadedAt: { lt: cutoff } },
      select: { id: true, path: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    for (const ph of batch) {
      const removed = await unlinkSilent(ph.path);
      if (removed) visitDeleted += 1;
      else visitMissing += 1;
    }
    await prisma.visitPhoto.deleteMany({
      where: { id: { in: batch.map((p) => p.id) } },
    });
  }

  // ChatPhoto
  for (;;) {
    const batch = await prisma.chatPhoto.findMany({
      where: { uploadedAt: { lt: cutoff } },
      select: { id: true, path: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    for (const ph of batch) {
      const removed = await unlinkSilent(ph.path);
      if (removed) chatDeleted += 1;
      else chatMissing += 1;
    }
    await prisma.chatPhoto.deleteMany({
      where: { id: { in: batch.map((p) => p.id) } },
    });
  }

  return {
    deleted: visitDeleted + chatDeleted,
    details: {
      cutoff: cutoff.toISOString(),
      visit: { deleted: visitDeleted, missingOnDisk: visitMissing },
      chat: { deleted: chatDeleted, missingOnDisk: chatMissing },
    },
  };
}
