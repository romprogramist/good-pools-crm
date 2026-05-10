"use client";

import { useState, useTransition } from "react";
import type { ChecklistQuestion, ChecklistQuestionType } from "@prisma/client";
import { ChecklistFieldRenderer } from "@/components/checklist/ChecklistFieldRenderer";
import { Card } from "@/components/Page";
import { saveChecklistAnswerAction } from "@/lib/server-actions/visit-report";
import { decodeChecklistValue } from "@/lib/visit/checklist-value";

type AnswerMap = Record<string, unknown>;
type FieldState = "idle" | "saving" | "saved" | "error";

export function VisitChecklistSection({
  visitId,
  questions,
  initialAnswers,
  disabled = false,
  onProgressChange,
}: {
  visitId: string;
  questions: ChecklistQuestion[];
  initialAnswers: AnswerMap;
  disabled?: boolean;
  onProgressChange?: (filled: number, totalRequired: number) => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const requiredQuestions = questions.filter((q) => q.required && q.active);

  function reportProgress(map: AnswerMap) {
    if (!onProgressChange) return;
    const filled = requiredQuestions.filter((q) => {
      const decoded = decodeChecklistValue(q.type, map[q.id]);
      if (decoded === null) return false;
      if (typeof decoded === "string") return decoded.trim() !== "";
      if (Array.isArray(decoded)) return decoded.length > 0;
      if (typeof decoded === "boolean") return true;
      return false;
    }).length;
    onProgressChange(filled, requiredQuestions.length);
  }

  function handleChange(question: ChecklistQuestion, raw: string | string[] | boolean | null) {
    const next = { ...answers, [question.id]: { v: raw } };
    setAnswers(next);
    reportProgress(next);
    setFieldState((s) => ({ ...s, [question.id]: "saving" }));
    setErrors((e) => ({ ...e, [question.id]: "" }));

    startTransition(async () => {
      const result = await saveChecklistAnswerAction({
        visitId,
        questionId: question.id,
        type: question.type as ChecklistQuestionType,
        value: raw,
      });
      if (result.ok) {
        setFieldState((s) => ({ ...s, [question.id]: "saved" }));
        setTimeout(() => {
          setFieldState((s) => ({ ...s, [question.id]: "idle" }));
        }, 1500);
      } else {
        setFieldState((s) => ({ ...s, [question.id]: "error" }));
        setErrors((e) => ({ ...e, [question.id]: result.error }));
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">
        Чек-лист {requiredQuestions.length > 0 && `(обязательных: ${requiredQuestions.length})`}
      </h2>
      <div className="flex flex-col gap-5">
        {questions.map((q) => {
          const state = fieldState[q.id] ?? "idle";
          const decoded = decodeChecklistValue(q.type, answers[q.id]);
          return (
            <div key={q.id} className="relative">
              <ChecklistFieldRenderer
                question={q}
                value={decoded}
                onChange={(v) => handleChange(q, v)}
                disabled={disabled}
              />
              {state === "saving" && (
                <span className="absolute right-0 top-0 text-xs text-zinc-400">сохранение...</span>
              )}
              {state === "saved" && (
                <span className="absolute right-0 top-0 text-xs text-green-600">✓ сохранено</span>
              )}
              {state === "error" && errors[q.id] && (
                <span className="absolute right-0 top-0 text-xs text-red-600">{errors[q.id]}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
