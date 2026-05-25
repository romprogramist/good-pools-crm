import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ endpoint: z.string().url() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.user.id },
  });

  if (result.count > 0) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        action: "push.subscription.removed",
        entityType: "PushSubscription",
        entityId: parsed.data.endpoint.slice(0, 100),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
