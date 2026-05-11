import path from "node:path";
import { existsSync } from "node:fs";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: {
    pool: { include: { customer: true } };
    serviceUser: true;
    checklistAnswers: { include: { question: true } };
    photos: true;
    extraWorks: true;
    chemistry: true;
  };
}>;

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, padding: 36, color: "#111" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "2 solid #0a0a0a",
    paddingBottom: 8,
    marginBottom: 16,
  },
  brand: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  title: { fontSize: 11, color: "#555" },
  metaTable: { marginBottom: 14 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 120, color: "#666" },
  metaValue: { flex: 1, fontWeight: 700 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottom: "1 solid #ddd",
  },
  qaRow: { flexDirection: "row", marginBottom: 3 },
  qaLabel: { flex: 1.3 },
  qaValue: { flex: 1, fontWeight: 700 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photo: { width: 150, height: 150, objectFit: "cover", marginRight: 6, marginBottom: 6 },
  table: { borderTop: "1 solid #ccc", borderLeft: "1 solid #ccc" },
  tr: { flexDirection: "row" },
  th: {
    borderRight: "1 solid #ccc",
    borderBottom: "1 solid #ccc",
    padding: 4,
    fontWeight: 700,
    backgroundColor: "#f5f5f5",
  },
  td: { borderRight: "1 solid #ccc", borderBottom: "1 solid #ccc", padding: 4 },
  totalRow: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end" },
  totalLabel: { fontSize: 12, marginRight: 16 },
  totalValue: { fontSize: 14, fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: "#888",
  },
});

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtAnswer(type: string, raw: unknown): string {
  const decoded = decodeChecklistValue(type as never, raw);
  if (decoded === null) return "—";
  if (Array.isArray(decoded)) return decoded.length ? decoded.join(", ") : "—";
  if (typeof decoded === "boolean") return decoded ? "Выполнено" : "Не выполнено";
  if (typeof decoded === "string") return decoded.trim() === "" ? "—" : decoded;
  return "—";
}

export function VisitReportPdf({ visit }: { visit: VisitWithRelations }) {
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const photos = visit.photos.filter((p) => existsSync(path.join(uploadsRoot, p.path)));

  const works = [...visit.extraWorks].sort((a, b) => a.order - b.order);
  const chems = [...visit.chemistry].sort((a, b) => a.order - b.order);

  const totalLabel = visit.totalAmount
    ? `${Number(visit.totalAmount).toLocaleString("ru-RU")} ₽`
    : "—";

  const answers = [...visit.checklistAnswers].sort(
    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
  );

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/*
          Прелоадер глифов: fontkit-subsetter в @react-pdf/renderer
          выкидывает некоторые цифры из subset'а если они появляются
          только в коротких числах. Невидимый текст со всеми цифрами и
          буквами гарантирует, что glyph есть в embedded font.
        */}
        <Text style={{ position: "absolute", top: -1000, left: -1000, fontSize: 1, color: "#fff" }}>
          0123456789 ₽ абвгдеёжзийклмнопрстуфхцчшщъыьэюя АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ
        </Text>
        <Text style={{ position: "absolute", top: -1000, left: -1000, fontSize: 1, color: "#fff", fontWeight: 700 }}>
          0123456789 ₽ абвгдеёжзийклмнопрстуфхцчшщъыьэюя АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ
        </Text>

        <View style={styles.header} fixed>
          <Text style={styles.brand}>ХОРОШИЕ БАССЕЙНЫ</Text>
          <Text style={styles.title}>Отчёт о визите</Text>
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Клиент</Text>
            <Text style={styles.metaValue}>{visit.pool.customer.fullName}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Бассейн</Text>
            <Text style={styles.metaValue}>
              {visit.pool.name}
              {visit.pool.address ? `, ${visit.pool.address}` : ""}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Дата визита</Text>
            <Text style={styles.metaValue}>{formatDate(visit.scheduledAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Сервисник</Text>
            <Text style={styles.metaValue}>{visit.serviceUser.name ?? "—"}</Text>
          </View>
          {visit.completedAt && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Завершён</Text>
              <Text style={styles.metaValue}>{formatDate(visit.completedAt)}</Text>
            </View>
          )}
        </View>

        {answers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Чек-лист</Text>
            {answers.map((a) => (
              <View key={a.id} style={styles.qaRow}>
                <Text style={styles.qaLabel}>{a.question.label}</Text>
                <Text style={styles.qaValue}>
                  {fmtAnswer(a.question.type, a.value)}
                  {a.question.unit ? ` ${a.question.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {photos.length > 0 && (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Фото объекта</Text>
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <Image
                  key={p.id}
                  src={path.join(uploadsRoot, p.path)}
                  style={styles.photo}
                />
              ))}
            </View>
          </View>
        )}

        {works.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Доп.работы</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { flex: 4 }]}>Наименование</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Сумма</Text>
              </View>
              {works.map((w) => (
                <View key={w.id} style={styles.tr}>
                  <Text style={[styles.td, { flex: 4 }]}>{w.name}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                    {Number(w.price).toLocaleString("ru-RU")} ₽
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {chems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Химия</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { flex: 3 }]}>Позиция</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Кол-во</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Цена</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Сумма</Text>
              </View>
              {chems.map((c) => {
                const sum = Number(c.priceAtMoment) * Number(c.qty);
                return (
                  <View key={c.id} style={styles.tr}>
                    <Text style={[styles.td, { flex: 3 }]}>{c.nameAtMoment}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {Number(c.qty).toLocaleString("ru-RU")} {c.unitAtMoment}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {Number(c.priceAtMoment).toLocaleString("ru-RU")} ₽
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {sum.toLocaleString("ru-RU")} ₽
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ИТОГО К ОПЛАТЕ:</Text>
          <Text style={styles.totalValue}>{totalLabel}</Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `ХОРОШИЕ БАССЕЙНЫ · Сочи · стр. ${pageNumber} из ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
