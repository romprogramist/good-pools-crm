import type { ChecklistQuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";

/** Ответ чек-листа → плоская строка для таблицы реестра и экспорта. */
export function formatChecklistAnswer(
  type: ChecklistQuestionType,
  raw: unknown,
): string {
  const decoded = decodeChecklistValue(type, raw);
  if (decoded === null) return "";
  if (Array.isArray(decoded)) return decoded.join(", ");
  if (typeof decoded === "boolean") return decoded ? "Да" : "Нет";
  return decoded.trim();
}

export type ChecklistRegistryColumn = {
  id: string;
  label: string;
  unit: string | null;
};

export type ChecklistRegistryRow = {
  visitId: string;
  date: Date;
  customerName: string;
  poolName: string;
  servicerName: string;
  answers: Record<string, string>;
};

/**
 * Сводный реестр чек-листов: все завершённые визиты × все вопросы чек-листа.
 * Вопросы берутся целиком (включая скрытые) — у старых визитов могут быть
 * ответы на ныне скрытые вопросы.
 */
export async function getChecklistRegistry(): Promise<{
  columns: ChecklistRegistryColumn[];
  rows: ChecklistRegistryRow[];
}> {
  const questions = await prisma.checklistQuestion.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true, unit: true },
  });

  const visits = await prisma.visit.findMany({
    where: { status: "completed" },
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: { include: { question: true } },
    },
  });

  const rows: ChecklistRegistryRow[] = visits.map((v) => {
    const answers: Record<string, string> = {};
    for (const a of v.checklistAnswers) {
      answers[a.questionId] = formatChecklistAnswer(a.question.type, a.value);
    }
    return {
      visitId: v.id,
      date: v.completedAt ?? v.scheduledAt,
      customerName: v.pool.customer.fullName,
      poolName: v.pool.name,
      servicerName: v.serviceUser.name ?? v.serviceUser.email ?? "—",
      answers,
    };
  });

  return { columns: questions, rows };
}
