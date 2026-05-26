import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type JobResult = {
  processed?: number;
  sent?: number;
  deleted?: number;
  skipped?: number;
  errors?: number;
  details?: Record<string, unknown>;
};

export async function runJob(
  name: string,
  fn: () => Promise<JobResult>,
): Promise<void> {
  const run = await prisma.cronRun.create({ data: { name } });
  const t0 = Date.now();
  console.log(`[cron] ${name} start`);
  try {
    const result = await fn();
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "ok",
        info: result as unknown as Prisma.InputJsonValue,
      },
    });
    console.log(`[cron] ${name} ok`, { ms: Date.now() - t0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    await prisma.cronRun
      .update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: "error",
          info: { error: message } as Prisma.InputJsonValue,
        },
      })
      .catch((e) => console.error("[cron] не смогли записать ошибку в CronRun", e));
    console.error(`[cron] ${name} error`, err);
  }
}
