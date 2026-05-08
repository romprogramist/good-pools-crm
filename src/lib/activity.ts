import { prisma } from "./prisma";

type LogInput = {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  diff?: Record<string, unknown>;
};

export async function logActivity(input: LogInput) {
  await prisma.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      diff: input.diff ? JSON.parse(JSON.stringify(input.diff)) : undefined,
    },
  });
}
