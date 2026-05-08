"use client";

import type { ChecklistQuestion } from "@prisma/client";
import { Input } from "@/components/ui/input";

type Value = string | string[] | boolean | null;

export function ChecklistFieldRenderer({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: Pick<
    ChecklistQuestion,
    "id" | "type" | "label" | "placeholder" | "unit" | "options" | "required"
  >;
  value?: Value;
  onChange?: (next: Value) => void;
  disabled?: boolean;
}) {
  const opts = Array.isArray(question.options) ? (question.options as string[]) : [];
  const isSingleInput = question.type === "text" || question.type === "number";
  const fieldId = `field-${question.id}`;

  return (
    <div className="flex flex-col gap-1.5">
      {isSingleInput ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-zinc-700">
          {question.label}
          {question.required && <span className="ml-1 text-red-600">*</span>}
        </label>
      ) : (
        <div className="text-sm font-medium text-zinc-700">
          {question.label}
          {question.required && <span className="ml-1 text-red-600">*</span>}
        </div>
      )}

      {question.type === "text" && (
        <Input
          id={fieldId}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={question.placeholder ?? undefined}
          disabled={disabled}
          className="h-11 text-base"
        />
      )}

      {question.type === "number" && (
        <div className="flex items-center gap-2">
          <Input
            id={fieldId}
            type="text"
            inputMode="decimal"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange?.(e.target.value.replace(",", "."))}
            placeholder={question.placeholder ?? undefined}
            disabled={disabled}
            className="h-11 flex-1 text-base"
          />
          {question.unit && (
            <span className="text-sm text-zinc-500">{question.unit}</span>
          )}
        </div>
      )}

      {question.type === "single_select" && (
        <div className="flex flex-col gap-2">
          {opts.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="radio"
                name={`q-${question.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange?.(opt)}
                disabled={disabled}
                className="h-4 w-4 accent-teal-600"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {question.type === "multi_select" && (
        <div className="flex flex-col gap-2">
          {opts.map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  onChange={(e) => {
                    if (!onChange) return;
                    if (e.target.checked) onChange([...arr, opt]);
                    else onChange(arr.filter((v) => v !== opt));
                  }}
                  disabled={disabled}
                  className="h-4 w-4 accent-teal-600"
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "bool" && (
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange?.(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-teal-600"
          />
          ВЫПОЛНЕНО
        </label>
      )}
    </div>
  );
}
