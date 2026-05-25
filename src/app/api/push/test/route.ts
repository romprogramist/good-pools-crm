import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push/send";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sentTo = await sendPush(session.user.id, {
    title: "Тестовый пуш",
    body: "Если ты это видишь — пуши работают",
    url: "/settings",
    tag: "test",
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      action: "push.test_sent",
      entityType: "User",
      entityId: session.user.id,
      diff: { sentTo } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, sentTo });
}
