import Link from "next/link";
import { redirect } from "next/navigation";
import type { ChecklistQuestionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { PageContainer, PageHeader, Card, Alert } from "@/components/Page";
import { prisma } from "@/lib/prisma";
import { ChecklistAdminList } from "@/components/checklist/ChecklistAdminList";
import { ChecklistPreview } from "@/components/checklist/ChecklistPreview";
import { ChecklistQuestionForm } from "@/components/checklist/ChecklistQuestionForm";
import { setQuestionActiveAction } from "@/lib/server-actions/checklist";

type Tab = "active" | "hidden" | "preview";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "hidden", label: "Скрытые" },
  { value: "preview", label: "Превью" },
];

const NEW_TYPE_OPTIONS: {
  type: ChecklistQuestionType;
  label: string;
  hint: string;
}[] = [
  { type: "text", label: "Текст", hint: "Свободный ввод" },
  { type: "number", label: "Число", hint: "С опц. ед. изм." },
  { type: "single_select", label: "Один из списка", hint: "Радио-кнопки" },
  { type: "multi_select", label: "Несколько из списка", hint: "Чекбоксы" },
  { type: "bool", label: "Да/Нет", hint: "Один чекбокс" },
];

const TYPE_VALUES: ChecklistQuestionType[] = [
  "text",
  "number",
  "single_select",
  "multi_select",
  "bool",
];

export default async function AdminChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    new?: string;
    edit?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const tab = (TAB_OPTIONS.find((t) => t.value === params.tab)?.value ?? "active") as Tab;

  const newType =
    params.new && TYPE_VALUES.includes(params.new as ChecklistQuestionType)
      ? (params.new as ChecklistQuestionType)
      : null;

  const editing = params.edit
    ? await prisma.checklistQuestion.findUnique({ where: { id: params.edit } })
    : null;

  const editNotFound = !!params.edit && !editing;

  const showNewPicker = params.new === "1";

  const allActive = await prisma.checklistQuestion.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  const allHidden = await prisma.checklistQuestion.findMany({
    where: { active: false },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Чек-лист"
          subtitle="Универсальный список вопросов для сервисного обслуживания"
          actions={
            <Link
              href="/admin/checklist?new=1"
              className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
            >
              + Добавить вопрос
            </Link>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{decodeURIComponent(params.ok)}</Alert>}
          {params.error && <Alert variant="error">{decodeURIComponent(params.error)}</Alert>}
          {editNotFound && <Alert variant="error">Вопрос не найден</Alert>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TAB_OPTIONS.map((t) => (
            <Link
              key={t.value}
              href={t.value === "active" ? "/admin/checklist" : `/admin/checklist?tab=${t.value}`}
              className={
                tab === t.value
                  ? "inline-flex h-9 items-center rounded-full bg-teal-600 px-4 text-sm font-medium text-white shadow-sm"
                  : "inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
              }
            >
              {t.label}
              {t.value === "active" && (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {allActive.length}
                </span>
              )}
              {t.value === "hidden" && allHidden.length > 0 && (
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                  {allHidden.length}
                </span>
              )}
            </Link>
          ))}
        </div>

        {editing ? (
          <ChecklistQuestionForm mode={{ kind: "edit", question: editing }} />
        ) : newType ? (
          <ChecklistQuestionForm mode={{ kind: "create", type: newType }} />
        ) : showNewPicker ? (
          <Card className="mt-6">
            <h2 className="text-lg font-semibold text-zinc-900">Какой тип вопроса?</h2>
            <p className="mt-1 text-sm text-zinc-500">
              После выбора откроется форма с нужными полями.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NEW_TYPE_OPTIONS.map((o) => (
                <Link
                  key={o.type}
                  href={`/admin/checklist?new=${o.type}`}
                  className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-teal-400 hover:shadow-sm"
                >
                  <div className="text-sm font-semibold text-zinc-900">{o.label}</div>
                  <div className="mt-1 text-xs text-zinc-500">{o.hint}</div>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="mt-6">
          {tab === "active" && (
            <ChecklistAdminList
              initial={allActive.map((q) => ({
                id: q.id,
                order: q.order,
                type: q.type,
                label: q.label,
                required: q.required,
                unit: q.unit,
                options: q.options,
                active: q.active,
              }))}
            />
          )}

          {tab === "hidden" && (
            <div className="space-y-3">
              {allHidden.length === 0 && (
                <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm ring-1 ring-zinc-200">
                  Скрытых вопросов нет.
                </div>
              )}
              {allHidden.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{q.label}</div>
                    <div className="mt-1 text-xs text-zinc-500">скрыт</div>
                  </div>
                  <Link
                    href={`/admin/checklist?edit=${q.id}`}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Изменить
                  </Link>
                  <form action={setQuestionActiveAction}>
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="active" value="true" />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-50"
                    >
                      Показать
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {tab === "preview" && (
            <ChecklistPreview
              questions={allActive.map((q) => ({
                id: q.id,
                type: q.type,
                label: q.label,
                placeholder: q.placeholder,
                unit: q.unit,
                options: q.options,
                required: q.required,
              }))}
            />
          )}
        </div>
      </PageContainer>
    </>
  );
}
