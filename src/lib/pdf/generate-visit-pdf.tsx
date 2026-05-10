import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { ensureFontsRegistered } from "./font-config";
import { VisitReportPdf } from "./VisitReportPdf";

export async function generateVisitPdf(visitId: string): Promise<{ path: string }> {
  ensureFontsRegistered();

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: {
        include: { question: true },
        orderBy: { question: { order: "asc" } },
      },
      photos: { orderBy: { uploadedAt: "asc" } },
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });
  if (!visit) throw new Error("Визит не найден");

  const buffer = await renderToBuffer(<VisitReportPdf visit={visit} />);

  const dir = path.join(process.cwd(), "uploads", "reports-pdf", visitId);
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, "report.pdf");
  await writeFile(filepath, buffer);

  const relative = `reports-pdf/${visitId}/report.pdf`;
  await prisma.visit.update({
    where: { id: visitId },
    data: { pdfPath: relative, pdfGeneratedAt: new Date() },
  });

  return { path: relative };
}
