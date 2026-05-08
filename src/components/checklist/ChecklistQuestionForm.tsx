"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChecklistQuestion, ChecklistQuestionType } from "@prisma/client";
import { Card, FormField } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createQuestionAction,
  updateQuestionAction,
} from "@/lib/server-actions/checklist";

type Mode =
  | { kind: "create"; type: ChecklistQuestionType }
  | { kind: "edit"; question: ChecklistQuestion };

const TYPE_TITLE: Record<ChecklistQuestionType, string> = {
  text: "текст",
  number: "число",
  single_select: "один из списка",
  multi_select: "несколько из списка",
  bool: "да/нет",
};

export function ChecklistQuestionForm({ mode }: { mode: Mode }) {
  const type = mode.kind === "create" ? mode.type : mode.question.type;
  const initialOptions =
    mode.kind === "edit" && Array.isArray(mode.question.options)
      ? (mode.question.options as string[])
      : type === "single_select" || type === "multi_select"
        ? ["", ""]
        : [];

  const [options, setOptions] = useState<string[]>(initialOptions);
  const isSelect = type === "single_select" || type === "multi_select";
  const isNumber = type === "number";
  const isText = type === "text";

  const action = mode.kind === "create" ? createQuestionAction : updateQuestionAction;
  const title =
    mode.kind === "create"
      ? `Новый вопрос — ${TYPE_TITLE[type]}`
      : `Редактирование — ${TYPE_TITLE[type]}`;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <Link
          href="/admin/checklist"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Закрыть
        </Link>
      </div>

      <form action={action} className="mt-5 space-y-4">
        {mode.kind === "edit" && (
          <input type="hidden" name="id" value={mode.question.id} />
        )}
        <input type="hidden" name="type" value={type} />

        <FormField label="Текст вопроса" htmlFor="label">
          <Input
            id="label"
            name="label"
            required
            maxLength={200}
            defaultValue={mode.kind === "edit" ? mode.question.label : ""}
            className="h-11 text-base"
            placeholder="Например: Уровень pH"
          />
        </FormField>

        {(isText || isNumber) && (
          <FormField label="Подсказка (placeholder)" htmlFor="placeholder" hint="Короткая подсказка в поле ввода — необязательно">
            <Input
              id="placeholder"
              name="placeholder"
              maxLength={100}
              defaultValue={mode.kind === "edit" ? (mode.question.placeholder ?? "") : ""}
              className="h-11 text-base"
              placeholder="Например: 7.0–7.6"
            />
          </FormField>
        )}

        {isNumber && (
          <FormField label="Единица измерения" htmlFor="unit" hint="Например: мг/л, бар, г/л">
            <Input
              id="unit"
              name="unit"
              maxLength={20}
              defaultValue={mode.kind === "edit" ? (mode.question.unit ?? "") : ""}
              className="h-11 text-base"
            />
          </FormField>
        )}

        {isSelect && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">Варианты ответа</span>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  name="options"
                  value={opt}
                  onChange={(e) =>
                    setOptions((s) => s.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  required
                  maxLength={100}
                  className="h-11 flex-1 text-base"
                  placeholder={`Вариант ${idx + 1}`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((s) => s.filter((_, i) => i !== idx))}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Убрать
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((s) => [...s, ""])}
              className="self-start text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              + Добавить вариант
            </button>
            <p className="text-xs text-zinc-500">Минимум 2 варианта.</p>
          </div>
        )}

        <FormField label="Обязательность" htmlFor="required" hint="Сервисник не сможет завершить визит без ответа на этот вопрос">
          <label className="flex items-center gap-2 text-sm">
            <input
              id="required"
              name="required"
              type="checkbox"
              defaultChecked={mode.kind === "edit" ? mode.question.required : true}
              className="h-4 w-4 accent-teal-600"
            />
            Обязательный
          </label>
        </FormField>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {mode.kind === "create" ? "Добавить" : "Сохранить"}
          </Button>
          <Link
            href="/admin/checklist"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
        </div>
      </form>
    </Card>
  );
}
