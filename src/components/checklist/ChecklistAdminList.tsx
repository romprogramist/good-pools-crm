"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistQuestion } from "@prisma/client";
import { reorderQuestionsAction, setQuestionActiveAction } from "@/lib/server-actions/checklist";

type Q = Pick<
  ChecklistQuestion,
  "id" | "order" | "type" | "label" | "required" | "unit" | "options" | "active"
>;

const TYPE_LABEL: Record<Q["type"], string> = {
  text: "Текст",
  number: "Число",
  single_select: "Один из списка",
  multi_select: "Несколько из списка",
  bool: "Да/Нет",
};

const TYPE_BADGE: Record<Q["type"], string> = {
  text: "bg-sky-100 text-sky-800",
  number: "bg-violet-100 text-violet-800",
  single_select: "bg-amber-100 text-amber-800",
  multi_select: "bg-orange-100 text-orange-800",
  bool: "bg-emerald-100 text-emerald-800",
};

export function ChecklistAdminList({ initial }: { initial: Q[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startTransition(async () => {
      const res = await reorderQuestionsAction(reordered.map((i) => i.id));
      if (!res.ok) {
        setError(res.error ?? "Не удалось сохранить порядок");
        setItems(items); // откат
      } else {
        setError(null);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
        Активных вопросов нет. Добавь первый через кнопку выше.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">
          {error}
        </div>
      )}
      {pending && (
        <div className="text-xs text-zinc-500">Сохраняем порядок…</div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((q) => (
            <SortableRow key={q.id} q={q} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({ q }: { q: Q }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const opts = Array.isArray(q.options) ? (q.options as string[]) : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
        className="cursor-grab touch-none rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[q.type]}`}>
            {TYPE_LABEL[q.type]}
          </span>
          <span className="truncate text-sm font-medium text-zinc-900">{q.label}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {q.required && <span>обязательный</span>}
          {q.unit && <span>ед.: {q.unit}</span>}
          {opts.length > 0 && <span>вариантов: {opts.length}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/admin/checklist?edit=${q.id}`}
          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
        >
          Изменить
        </Link>
        <form action={setQuestionActiveAction}>
          <input type="hidden" name="id" value={q.id} />
          <input type="hidden" name="active" value="false" />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            Скрыть
          </button>
        </form>
      </div>
    </div>
  );
}
