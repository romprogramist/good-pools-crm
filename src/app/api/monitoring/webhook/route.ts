import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/monitoring/token";
import { ingestMonitoringMessage } from "@/lib/monitoring/ingest";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Проверка доступности адреса из браузера/curl — без токена и без данных. */
export async function GET() {
  return json(200, {
    ok: true,
    service: "good-pools-crm monitoring webhook",
    hint: "Отправляйте POST с JSON и заголовком Authorization: Bearer <token>",
  });
}

export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return json(401, { ok: false, error: "Нужен заголовок Authorization: Bearer <token>" });
  }

  const controller = await prisma.monitoringController.findUnique({
    where: { tokenHash: hashToken(match[1]) },
  });
  if (!controller) return json(401, { ok: false, error: "Неверный токен" });
  if (!controller.active) return json(403, { ok: false, error: "Контроллер отключён в CRM" });

  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Сообщение больше 256 КБ" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: "Тело запроса — не корректный JSON" });
  }

  try {
    const result = await ingestMonitoringMessage(controller, payload);
    return json(result.status, result.body);
  } catch (err) {
    console.error("[monitoring] webhook failed", { controller: controller.externalId, err });
    // 500 → контроллер повторит отправку с тем же message_id.
    return json(500, { ok: false, error: "Внутренняя ошибка CRM, повторите отправку" });
  }
}
