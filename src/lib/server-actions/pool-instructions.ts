"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Scope = "admin" | "service";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const INSTRUCTIONS_DIR = path.join(UPLOAD_ROOT, "pool-instructions");

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

const KindEnum = z.enum(["pdf", "text", "link"]);
const TitleSchema = z.string().trim().min(1).max(200);
const TextSchema = z.string().trim().min(1).max(20000);
const UrlSchema = z.string().trim().url();

export async function createInstructionAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  if (!customerId || !poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Не указан бассейн"),
    });
  }

  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.customerId !== customerId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Бассейн не найден"),
    });
  }

  const kindParse = KindEnum.safeParse(formData.get("kind"));
  const titleParse = TitleSchema.safeParse(formData.get("title"));
  if (!kindParse.success || !titleParse.success) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Заполните название и выберите тип"),
    });
  }

  const kind = kindParse.data;
  const title = titleParse.data;

  const data: {
    poolId: string;
    kind: typeof kind;
    title: string;
    content?: string;
    path?: string;
    url?: string;
  } = { poolId, kind, title };

  if (kind === "text") {
    const c = TextSchema.safeParse(formData.get("content"));
    if (!c.success) {
      backToPool(scope, customerId, poolId, {
        error: encodeURIComponent("Текст инструкции не может быть пустым"),
      });
    }
    data.content = c.data;
  }

  if (kind === "link") {
    const u = UrlSchema.safeParse(formData.get("url"));
    if (!u.success) {
      backToPool(scope, customerId, poolId, {
        error: encodeURIComponent("Укажите корректную ссылку (https://...)"),
      });
    }
    data.url = u.data;
  }

  if (kind === "pdf") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      backToPool(scope, customerId, poolId, {
        error: encodeURIComponent("Прикрепите PDF-файл"),
      });
    }
    if (file.type !== "application/pdf") {
      backToPool(scope, customerId, poolId, {
        error: encodeURIComponent("Ожидался PDF"),
      });
    }
    if (file.size > MAX_PDF_BYTES) {
      backToPool(scope, customerId, poolId, {
        error: encodeURIComponent("Файл больше 25 МБ"),
      });
    }
    const dir = path.join(INSTRUCTIONS_DIR, poolId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.pdf`;
    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);
    data.path = `pool-instructions/${poolId}/${filename}`;
  }

  const created = await prisma.poolInstruction.create({ data });

  await logActivity({
    actorId: actor.id,
    action: "pool.instruction.create",
    entityType: "PoolInstruction",
    entityId: created.id,
    diff: { poolId, kind, title },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, { ok: encodeURIComponent("Инструкция добавлена") });
}

export async function deleteInstructionAction(formData: FormData) {
  const actor = await requireStaff();
  const scope = (formData.get("scope") as Scope) ?? "admin";
  const customerId = String(formData.get("customerId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const instructionId = String(formData.get("instructionId") ?? "");
  if (!instructionId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Не указана инструкция"),
    });
  }

  const instruction = await prisma.poolInstruction.findUnique({
    where: { id: instructionId },
  });
  if (!instruction || instruction.poolId !== poolId) {
    backToPool(scope, customerId, poolId, {
      error: encodeURIComponent("Инструкция не найдена"),
    });
  }

  if (instruction.path) {
    const filepath = path.join(UPLOAD_ROOT, instruction.path);
    try {
      if (existsSync(filepath)) await unlink(filepath);
    } catch {
      // ignore
    }
  }

  await prisma.poolInstruction.delete({ where: { id: instructionId } });

  await logActivity({
    actorId: actor.id,
    action: "pool.instruction.delete",
    entityType: "PoolInstruction",
    entityId: instructionId,
    diff: { poolId, title: instruction.title, kind: instruction.kind },
  });

  revalidatePath(`/${scope}/customers/${customerId}/pools/${poolId}`);
  backToPool(scope, customerId, poolId, {
    ok: encodeURIComponent("Инструкция удалена"),
  });
}
