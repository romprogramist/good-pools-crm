import "dotenv/config";
import cron from "node-cron";
import { runJob } from "./run-job";
import { warrantyJob } from "./jobs/warranty";
import { regulationJob } from "./jobs/regulation";
import { cleanupJob } from "./jobs/cleanup";

const TZ = process.env.CRON_TZ ?? "Europe/Moscow";
const SCHEDULE_WARRANTY = process.env.CRON_WARRANTY ?? "0 9 * * *";
const SCHEDULE_REGULATION = process.env.CRON_REGULATION ?? "0 9 * * *";
const SCHEDULE_CLEANUP = process.env.CRON_CLEANUP ?? "0 3 * * *";

function bail(message: string): never {
  console.error(`[worker] ${message}`);
  process.exit(1);
}

for (const [name, expr] of [
  ["CRON_WARRANTY", SCHEDULE_WARRANTY],
  ["CRON_REGULATION", SCHEDULE_REGULATION],
  ["CRON_CLEANUP", SCHEDULE_CLEANUP],
] as const) {
  if (!cron.validate(expr)) bail(`Некорректное cron-выражение в ${name}: "${expr}"`);
}

async function runOnce(): Promise<void> {
  await runJob("warranty", warrantyJob);
  await runJob("regulation", regulationJob);
  await runJob("cleanup", cleanupJob);
}

if (process.env.RUN_ONCE === "1") {
  console.log("[worker] RUN_ONCE=1 — выполняем все джобы и выходим");
  runOnce()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[worker] RUN_ONCE failed", err);
      process.exit(1);
    });
} else {
  console.log(`[worker] starting, TZ=${TZ}`);
  console.log(`[worker]  warranty:   ${SCHEDULE_WARRANTY}`);
  console.log(`[worker]  regulation: ${SCHEDULE_REGULATION}`);
  console.log(`[worker]  cleanup:    ${SCHEDULE_CLEANUP}`);

  cron.schedule(
    SCHEDULE_WARRANTY,
    () => {
      void runJob("warranty", warrantyJob);
    },
    { timezone: TZ },
  );
  cron.schedule(
    SCHEDULE_REGULATION,
    () => {
      void runJob("regulation", regulationJob);
    },
    { timezone: TZ },
  );
  cron.schedule(
    SCHEDULE_CLEANUP,
    () => {
      void runJob("cleanup", cleanupJob);
    },
    { timezone: TZ },
  );

  const shutdown = (sig: string) => {
    console.log(`[worker] ${sig} — останавливаемся`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
