import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/prisma";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Card, FormField, Alert } from "@/components/Page";
import {
  createChemistryAction,
  updateChemistryAction,
  setChemistryActiveAction,
} from "@/lib/server-actions/chemistry";

const COMMON_UNITS = ["кг", "г", "л", "мл", "шт", "уп", "таб"];

function formatPrice(value: { toString(): string }) {
  return (
    Number(value).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " ₽"
  );
}

export default async function ChemistryPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; ok?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const params = await searchParams;
  const isNew = params.new === "1";
  const editId = params.edit ?? null;

  const items = await prisma.chemistryItem.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { usages: true } } },
  });

  const editingRow = editId ? items.find((i) => i.id === editId) ?? null : null;

  return (
    <>
      <Header />
      <PageContainer>
        <PageHeader
          title="Прайс химии"
          subtitle="Позиции, доступные сервиснику при добавлении химии в визит"
          actions={
            <>
              <Link
                href="/admin"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                ← В админку
              </Link>
              {!isNew && !editingRow && (
                <Link
                  href="/admin/chemistry?new=1"
                  className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
                >
                  + Новая позиция
                </Link>
              )}
            </>
          }
        />

        <div className="mt-6 space-y-4">
          {params.ok && <Alert variant="success">{decodeURIComponent(params.ok)}</Alert>}
          {params.error && <Alert variant="error">{decodeURIComponent(params.error)}</Alert>}
        </div>

        {isNew && <ChemistryForm mode="create" />}
        {editingRow && (
          <ChemistryForm
            mode="update"
            initial={{
              id: editingRow.id,
              name: editingRow.name,
              unit: editingRow.unit,
              price: Number(editingRow.price),
            }}
          />
        )}

        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Название</th>
                  <th className="px-5 py-3">Единица</th>
                  <th className="px-5 py-3">Цена</th>
                  <th className="px-5 py-3">Использований</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                      Позиций пока нет. Добавьте первую — например «Хлор
                      гранулированный, кг, 800 ₽».
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-900">{item.name}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{item.unit}</td>
                    <td className="px-5 py-4 text-zinc-700">{formatPrice(item.price)}</td>
                    <td className="px-5 py-4 text-zinc-700">{item._count.usages}</td>
                    <td className="px-5 py-4">
                      {item.active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          активна
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          скрыта
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/chemistry?edit=${item.id}`}
                          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                        >
                          Изменить
                        </Link>
                        <form action={setChemistryActiveAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={item.active ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                          >
                            {item.active ? "Скрыть" : "Показать"}
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

        <p className="mt-4 text-xs text-zinc-500">
          Скрытые позиции не предлагаются сервиснику в новых визитах, но остаются
          в отчётах прошлых визитов — там название и цена зафиксированы на момент
          работ.
        </p>
      </PageContainer>
    </>
  );
}

function ChemistryForm({
  mode,
  initial,
}: {
  mode: "create" | "update";
  initial?: {
    id: string;
    name: string;
    unit: string;
    price: number;
  };
}) {
  const action = mode === "create" ? createChemistryAction : updateChemistryAction;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          {mode === "create" ? "Новая позиция" : "Редактирование позиции"}
        </h2>
        <Link
          href="/admin/chemistry"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Закрыть
        </Link>
      </div>

      <form action={action} className="mt-5 space-y-4">
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <FormField label="Название" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={160}
            defaultValue={initial?.name ?? ""}
            placeholder="Хлор гранулированный"
            className="h-11 text-base"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Единица измерения" htmlFor="unit" hint="например: кг, л, шт">
            <Input
              id="unit"
              name="unit"
              list="chemistry-units"
              required
              maxLength={32}
              defaultValue={initial?.unit ?? ""}
              placeholder="кг"
              className="h-11 text-base"
            />
            <datalist id="chemistry-units">
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Цена за единицу" htmlFor="price" hint="в рублях">
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              max={10000000}
              step="0.01"
              required
              defaultValue={initial?.price ?? ""}
              placeholder="800"
              className="h-11 text-base"
            />
          </FormField>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {mode === "create" ? "Добавить" : "Сохранить"}
          </Button>
          <Link
            href="/admin/chemistry"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
        </div>
      </form>
    </Card>
  );
}
