import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const CHAT_DIR = path.join(UPLOAD_ROOT, "chat");

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 2000;

export type ChatMessageDTO = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  fromClient: boolean;
  createdAt: string;
  readAt: string | null;
  photos: { id: string; url: string }[];
};

export type StaffThreadRow = {
  id: string;
  customerId: string;
  customerName: string;
  lastMessage: string;
  lastAt: Date;
  unread: number;
};

/** Тред у клиента ровно один — создаём лениво при первом открытии раздела. */
export async function getOrCreateClientThread(customerId: string) {
  return prisma.chatThread.upsert({
    where: { customerId },
    create: { customerId },
    update: {},
  });
}

export async function loadThreadMessages(
  threadId: string,
): Promise<ChatMessageDTO[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true, email: true, role: true } },
      photos: { select: { id: true, path: true } },
    },
  });

  return messages.map((m) => ({
    id: m.id,
    body: m.body,
    senderId: m.senderId,
    senderName: m.sender.name ?? m.sender.email ?? "—",
    fromClient: m.sender.role === "client",
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    photos: m.photos.map((p) => ({ id: p.id, url: `/api/files/${p.path}` })),
  }));
}

/** Помечает прочитанными сообщения от противоположной стороны. */
export async function markThreadRead(threadId: string, viewerRole: Role) {
  await prisma.chatMessage.updateMany({
    where: {
      threadId,
      readAt: null,
      sender:
        viewerRole === "client"
          ? { role: { in: ["admin", "service"] } }
          : { role: "client" },
    },
    data: { readAt: new Date() },
  });
}

/** Сохраняет фото-вложения сообщения в uploads/chat/{threadId}/. */
export async function saveChatPhotos(
  messageId: string,
  threadId: string,
  files: File[],
): Promise<number> {
  const valid = files.filter(
    (f) =>
      ALLOWED_PHOTO_TYPES.has(f.type) && f.size > 0 && f.size <= MAX_PHOTO_BYTES,
  );
  if (valid.length === 0) return 0;

  const dir = path.join(CHAT_DIR, threadId);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  let saved = 0;
  for (const file of valid) {
    const buffer = Buffer.from((await file.arrayBuffer()) as ArrayBuffer);
    let outBuffer: Buffer = buffer;
    let outExt = ".jpg";
    let width: number | null = null;
    let height: number | null = null;

    try {
      const img = sharp(buffer).rotate();
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
      const fm = await sharp(outBuffer).metadata();
      width = fm.width ?? null;
      height = fm.height ?? null;
    } catch {
      // sharp не справился (например HEIC без libvips) — сохраняем оригинал
      outBuffer = buffer;
      outExt =
        file.type === "image/png"
          ? ".png"
          : file.type === "image/webp"
            ? ".webp"
            : file.type === "image/heic" || file.type === "image/heif"
              ? ".heic"
              : ".jpg";
    }

    const filename = `${randomUUID()}${outExt}`;
    await writeFile(path.join(dir, filename), outBuffer);
    await prisma.chatPhoto.create({
      data: {
        messageId,
        path: `chat/${threadId}/${filename}`,
        originalName: file.name,
        size: outBuffer.length,
        width,
        height,
      },
    });
    saved++;
  }
  return saved;
}

/** Список всех тредов для персонала: имя клиента, превью, кол-во непрочитанных. */
export async function listStaffThreads(): Promise<StaffThreadRow[]> {
  const threads = await prisma.chatThread.findMany({
    include: {
      customer: { select: { id: true, fullName: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, photos: { select: { id: true } } },
      },
      _count: {
        select: {
          messages: { where: { readAt: null, sender: { role: "client" } } },
        },
      },
    },
  });

  return threads
    .map((t) => {
      const last = t.messages[0];
      return {
        id: t.id,
        customerId: t.customer.id,
        customerName: t.customer.fullName,
        lastMessage: last
          ? last.body || (last.photos.length ? "📷 Фото" : "")
          : "",
        lastAt: last ? last.createdAt : t.updatedAt,
        unread: t._count.messages,
      };
    })
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}
