"use client";

import { useState } from "react";
import type { ChecklistQuestion } from "@prisma/client";
import { ChecklistFieldRenderer } from "./ChecklistFieldRenderer";

type Q = Pick<
  ChecklistQuestion,
  "id" | "type" | "label" | "placeholder" | "unit" | "options" | "required"
>;

export function ChecklistPreview({ questions }: { questions: Q[] }) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
        Активных вопросов нет — превью пустое.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:p-6">
      <div className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
        Так увидит чек-лист сервисник на визите. Ответы тут не сохраняются.
      </div>
      <div className="flex flex-col gap-5">
        {questions.map((q) => (
          <ChecklistFieldRenderer
            key={q.id}
            question={q}
            value={(values[q.id] as never) ?? null}
            onChange={(next) => setValues((s) => ({ ...s, [q.id]: next }))}
          />
        ))}
      </div>
    </div>
  );
}
