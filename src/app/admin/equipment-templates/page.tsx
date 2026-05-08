import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Card, FormField, Alert } from "@/components/Page";
import {
  createTemplateAction,
  updateTemplateAction,
  setTemplateActiveAction,
} from "@/lib/server-actions/equipment-templates";

export default async function EquipmentTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; ok?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const isNew = params.new === "1";
  const editId = params.edit ?? null;

  const templates = await prisma.equipmentTemplate.findMany({
    orderBy: [{ active: "desc" }, { typeName: "asc" }],
    include: { _count: { select: { equipment: true } } },
  });

  const editing = editId ? templates.find((t) => t.id === editId) ?? null : null;

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Шаблоны оборудования"
          subtitle="Типовые позиции с гарантией и периодом регламента"
          actions={
            <>
              <Link
                href="/admin"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                ← В админку
              </Link>
              {!isNew && !editing && (
                <Link
                  href="/admin/equipment-templates?new=1"
                  className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
                >
                  + Новый шаблон
                </Link>
              )}
            </>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{decodeURIComponent(params.ok)}</Alert>}
          {params.error && <Alert variant="error">{decodeURIComponent(params.error)}</Alert>}
        </div>

        {isNew && <TemplateForm mode="create" />}
        {editing && (
          <TemplateForm
            mode="update"
            initial={{
              id: editing.id,
              typeName: editing.typeName,
              defaultWarrantyMonths: editing.defaultWarrantyMonths,
              regulationPeriodDays: editing.regulationPeriodDays,
              notes: editing.notes,
            }}
          />
        )}

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Тип</th>
                  <th className="px-5 py-3">Гарантия (мес)</th>
                  <th className="px-5 py-3">Регламент (дни)</th>
                  <th className="px-5 py-3">Используется</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                      Шаблонов пока нет. Создайте первый — например «Датчик хлора, 6 мес, 90 дней».
                    </td>
                  </tr>
                )}
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-900">{t.typeName}</div>
                      {t.notes && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                          {t.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{t.defaultWarrantyMonths}</td>
                    <td className="px-5 py-4 text-zinc-700">{t.regulationPeriodDays}</td>
                    <td className="px-5 py-4 text-zinc-700">{t._count.equipment}</td>
                    <td className="px-5 py-4">
                      {t.active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          активен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          скрыт
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/equipment-templates?edit=${t.id}`}
                          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                        >
                          Изменить
                        </Link>
                        <form action={setTemplateActiveAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={t.active ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                          >
                            {t.active ? "Скрыть" : "Показать"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}

function TemplateForm({
  mode,
  initial,
}: {
  mode: "create" | "update";
  initial?: {
    id: string;
    typeName: string;
    defaultWarrantyMonths: number;
    regulationPeriodDays: number;
    notes: string | null;
  };
}) {
  const action = mode === "create" ? createTemplateAction : updateTemplateAction;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          {mode === "create" ? "Новый шаблон" : "Редактирование шаблона"}
        </h2>
        <Link
          href="/admin/equipment-templates"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Закрыть
        </Link>
      </div>

      <form action={action} className="mt-5 space-y-4">
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <FormField label="Тип оборудования" htmlFor="typeName">
          <Input
            id="typeName"
            name="typeName"
            required
            maxLength={120}
            defaultValue={initial?.typeName ?? ""}
            placeholder="Датчик хлора"
            className="h-11 text-base"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Гарантия по умолчанию"
            htmlFor="defaultWarrantyMonths"
            hint="в месяцах"
          >
            <Input
              id="defaultWarrantyMonths"
              name="defaultWarrantyMonths"
              type="number"
              min={0}
              max={600}
              required
              defaultValue={initial?.defaultWarrantyMonths ?? 12}
              className="h-11 text-base"
            />
          </FormField>
          <FormField
            label="Период регламента"
            htmlFor="regulationPeriodDays"
            hint="в днях"
          >
            <Input
              id="regulationPeriodDays"
              name="regulationPeriodDays"
              type="number"
              min={0}
              max={3650}
              required
              defaultValue={initial?.regulationPeriodDays ?? 90}
              className="h-11 text-base"
            />
          </FormField>
        </div>

        <FormField label="Заметки" htmlFor="notes" hint="необязательно">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={initial?.notes ?? ""}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          />
        </FormField>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {mode === "create" ? "Создать" : "Сохранить"}
          </Button>
          <Link
            href="/admin/equipment-templates"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
        </div>
      </form>
    </Card>
  );
}
