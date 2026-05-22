import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { getChecklistRegistry } from "@/lib/registry/checklists";
import { formatMoscowDate } from "@/lib/calendar/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const { columns, rows } = await getChecklistRegistry();

  const headers = [
    "Дата визита",
    "Клиент",
    "Объект",
    "Сервисник",
    ...columns.map((c) => (c.unit ? `${c.label}, ${c.unit}` : c.label)),
  ];
  const dataRows = rows.map((r) => [
    formatMoscowDate(r.date),
    r.customerName,
    r.poolName,
    r.servicerName,
    ...columns.map((c) => r.answers[c.id] ?? ""),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [headers, ...dataRows]
      .map((row) => row.map(esc).join(";"))
      .join("\r\n");
    // BOM — чтобы Excel открыл кириллицу в UTF-8 корректно
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="checklists-${stamp}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Чек-листы");
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of dataRows) ws.addRow(row);
  ws.columns.forEach((col, i) => {
    col.width = i < 4 ? 22 : 28;
  });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="checklists-${stamp}.xlsx"`,
    },
  });
}
