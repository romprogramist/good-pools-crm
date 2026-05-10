import type { ChecklistQuestionType } from "@prisma/client";

// Wrapper { v: ... } для всех типов — упрощает миграции типов в будущем
export type ChecklistValueRaw =
  | { v: string }
  | { v: string[] }
  | { v: boolean }
  | { v: null };

export type ChecklistAnswerInput =
  | { type: "text"; value: string }
  | { type: "number"; value: string } // храним как строку (запятая → точка делается рендером)
  | { type: "single_select"; value: string }
  | { type: "multi_select"; value: string[] }
  | { type: "bool"; value: boolean };

export function encodeChecklistValue(input: ChecklistAnswerInput): ChecklistValueRaw {
  return { v: input.value as never };
}

export function decodeChecklistValue(
  type: ChecklistQuestionType,
  raw: unknown,
): string | string[] | boolean | null {
  if (!raw || typeof raw !== "object" || !("v" in raw)) return null;
  const v = (raw as { v: unknown }).v;
  switch (type) {
    case "text":
    case "number":
    case "single_select":
      return typeof v === "string" ? v : null;
    case "multi_select":
      return Array.isArray(v) ? (v as string[]) : null;
    case "bool":
      return typeof v === "boolean" ? v : null;
    default:
      return null;
  }
}

export function isAnswerEmpty(
  type: ChecklistQuestionType,
  decoded: string | string[] | boolean | null,
): boolean {
  if (decoded === null) return true;
  switch (type) {
    case "text":
    case "number":
    case "single_select":
      return typeof decoded === "string" && decoded.trim() === "";
    case "multi_select":
      return Array.isArray(decoded) && decoded.length === 0;
    case "bool":
      return typeof decoded !== "boolean";
  }
}
