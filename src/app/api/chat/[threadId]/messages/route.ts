import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadThreadMessages, markThreadRead } from "@/lib/chat";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { threadId } = await params;
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { customer: { select: { userId: true } } },
  });
  if (!thread) {
    return NextResponse.json({ error: "Тред не найден" }, { status: 404 });
  }

  const role = session.user.role;
  if (role === "client" && thread.customer.userId !== session.user.id) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (role !== "client" && role !== "admin" && role !== "service") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  await markThreadRead(threadId, role);
  const messages = await loadThreadMessages(threadId);
  return NextResponse.json({ messages });
}
