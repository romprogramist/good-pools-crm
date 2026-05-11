import { prisma } from "@/lib/prisma";
import { decodeChecklistValue, isAnswerEmpty } from "./checklist-value";

export type CompletionCheck = {
  ok: boolean;
  missingRequired: { questionId: string; label: string }[];
  photoCount: number;
  errors: string[];
};

export async function checkVisitCanComplete(visitId: string): Promise<CompletionCheck> {
  const [questions, answers, photoCount] = await Promise.all([
    prisma.checklistQuestion.findMany({
      where: { active: true, required: true },
      select: { id: true, type: true, label: true },
    }),
    prisma.visitChecklistAnswer.findMany({
      where: { visitId },
      select: { questionId: true, value: true },
    }),
    prisma.visitPhoto.count({ where: { visitId } }),
  ]);

  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  const missingRequired: { questionId: string; label: string }[] = [];

  for (const q of questions) {
    const raw = answerMap.get(q.id);
    if (raw === undefined) {
      missingRequired.push({ questionId: q.id, label: q.label });
      continue;
    }
    const decoded = decodeChecklistValue(q.type, raw);
    if (isAnswerEmpty(q.type, decoded)) {
      missingRequired.push({ questionId: q.id, label: q.label });
    }
  }

  const errors: string[] = [];
  if (missingRequired.length > 0) {
    errors.push(`Не заполнены обязательные вопросы (${missingRequired.length})`);
  }
  if (photoCount === 0) {
    errors.push("Нужно прикрепить минимум 1 фото");
  }

  return {
    ok: errors.length === 0,
    missingRequired,
    photoCount,
    errors,
  };
}
