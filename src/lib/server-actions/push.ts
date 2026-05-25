"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push/send";

export async function unsubscribeDeviceAction(endpoint: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });
  if (result.count > 0) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        action: "push.subscription.removed",
        entityType: "PushSubscription",
        entityId: endpoint.slice(0, 100),
      },
    });
  }
  revalidatePath("/settings");
}

export async function sendTestPushAction(): Promise<{ sentTo: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

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
    },
  });
  return { sentTo };
}
