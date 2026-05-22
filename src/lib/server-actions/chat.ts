"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveChatPhotos } from "@/lib/chat";
import { enqueuePush, listAdminAndServiceRecipients } from "@/lib/push/stub";

export async function sendChatMessageAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Не авторизован" };
  const user = session.user;

  const threadId = String(formData.get("threadId") ?? "");
  if (!threadId) return { ok: false, error: "Тред не указан" };

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { customer: { select: { userId: true } } },
  });
  if (!thread) return { ok: false, error: "Тред не найден" };

  const isClient = user.role === "client";
  const isStaff = user.role === "admin" || user.role === "service";
  if (isClient && thread.customer.userId !== user.id) {
    return { ok: false, error: "Доступ запрещён" };
  }
  if (!isClient && !isStaff) return { ok: false, error: "Доступ запрещён" };

  const body = String(formData.get("body") ?? "")
    .trim()
    .slice(0, 4000);
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!body && files.length === 0) {
    return { ok: false, error: "Пустое сообщение" };
  }

  const message = await prisma.chatMessage.create({
    data: { threadId, senderId: user.id, body },
  });

  if (files.length > 0) {
    await saveChatPhotos(message.id, threadId, files);
  }

  // двигаем тред наверх списка
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  // push противоположной стороне (заглушка до этапа 12)
  const preview = body.slice(0, 80);
  if (isClient) {
    const recipients = await listAdminAndServiceRecipients();
    await enqueuePush("new_chat_message", recipients, { threadId, preview });
  } else {
    await enqueuePush(
      "new_chat_message",
      [{ userId: thread.customer.userId }],
      { threadId, preview },
    );
  }

  revalidatePath("/client/support");
  revalidatePath("/service/support");
  revalidatePath("/admin/support");
  revalidatePath(`/service/support/${threadId}`);
  revalidatePath(`/admin/support/${threadId}`);

  return { ok: true };
}
