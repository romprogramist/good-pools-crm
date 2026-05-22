import { NextResponse } from "next/server";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

function unauthorized() {
  return new NextResponse("Forbidden", { status: 403 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const safe = segments.map((s) => s.replace(/[\\/]/g, "")).join("/");
  const full = path.join(UPLOAD_ROOT, safe);
  // Prevent traversal
  if (!full.startsWith(UPLOAD_ROOT)) return new NextResponse("Bad request", { status: 400 });

  // Authorization per area
  const role = session.user.role;
  const [area, ...rest] = segments;

  if (area === "pool-photos" || area === "pool-instructions") {
    const poolId = rest[0];
    if (!poolId) return new NextResponse("Bad request", { status: 400 });

    if (role === "client") {
      const pool = await prisma.pool.findUnique({
        where: { id: poolId },
        select: { customer: { select: { userId: true } } },
      });
      if (!pool || pool.customer.userId !== session.user.id) return unauthorized();
    } else if (role !== "admin" && role !== "service") {
      return unauthorized();
    }
  } else if (area === "visit-photos" || area === "reports-pdf") {
    const visitId = rest[0];
    if (!visitId) return new NextResponse("Bad request", { status: 400 });

    if (role === "client") {
      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        select: { pool: { select: { customer: { select: { userId: true } } } } },
      });
      if (!visit || visit.pool.customer.userId !== session.user.id) return unauthorized();
    } else if (role !== "admin" && role !== "service") {
      return unauthorized();
    }
  } else if (area === "chat") {
    const threadId = rest[0];
    if (!threadId) return new NextResponse("Bad request", { status: 400 });

    if (role === "client") {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        select: { customer: { select: { userId: true } } },
      });
      if (!thread || thread.customer.userId !== session.user.id) return unauthorized();
    } else if (role !== "admin" && role !== "service") {
      return unauthorized();
    }
  } else {
    // Unknown area — staff only by default
    if (role !== "admin" && role !== "service") return unauthorized();
  }

  try {
    await stat(full);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await readFile(full);
  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";

  // reports-pdf пересоздаётся при правке завершённого визита — не кэшируем.
  // photos с UUID-именами immutable, можно держать кэш.
  const cacheControl =
    area === "reports-pdf"
      ? "private, no-cache, no-store, must-revalidate"
      : "private, max-age=300";

  return new NextResponse(file, {
    headers: {
      "content-type": type,
      "cache-control": cacheControl,
    },
  });
}
