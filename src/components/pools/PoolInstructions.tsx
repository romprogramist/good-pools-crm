"use client";

import { useState } from "react";
import type { InstructionKind } from "@prisma/client";
import { Card, FormField } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createInstructionAction,
  deleteInstructionAction,
} from "@/lib/server-actions/pool-instructions";

type Scope = "admin" | "service";

type InstructionItem = {
  id: string;
  kind: InstructionKind;
  title: string;
  content: string | null;
  path: string | null;
  url: string | null;
};

const KIND_LABEL: Record<InstructionKind, string> = {
  pdf: "PDF-файл",
  text: "Текст",
  link: "Ссылка",
};

export function PoolInstructions({
  scope,
  customerId,
  poolId,
  instructions,
}: {
  scope: Scope;
  customerId: string;
  poolId: string;
  instructions: InstructionItem[];
}) {
  const [kind, setKind] = useState<InstructionKind>("text");
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">Инструкции</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            + Добавить
          </button>
        )}
      </div>

      {open && (
        <form
          action={createInstructionAction}
          className="mt-4 space-y-4 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200"
        >
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="poolId" value={poolId} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Тип" htmlFor="kind">
              <select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as InstructionKind)}
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="text">Текст</option>
                <option value="pdf">PDF-файл</option>
                <option value="link">Ссылка</option>
              </select>
            </FormField>
            <FormField label="Название" htmlFor="title">
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder="Например: правила безопасности"
                className="h-11 text-base"
              />
            </FormField>
          </div>

          {kind === "text" && (
            <FormField label="Текст инструкции" htmlFor="content">
              <textarea
                id="content"
                name="content"
                rows={6}
                required
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </FormField>
          )}

          {kind === "pdf" && (
            <FormField label="PDF-файл" htmlFor="file" hint="до 25 МБ">
              <input
                id="file"
                type="file"
                name="file"
                accept="application/pdf"
                required
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
              />
            </FormField>
          )}

          {kind === "link" && (
            <FormField label="URL" htmlFor="url" hint="должен начинаться с https://">
              <Input
                id="url"
                name="url"
                type="url"
                required
                placeholder="https://..."
                className="h-11 text-base"
              />
            </FormField>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="h-10 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Добавить
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {instructions.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100">
          {instructions.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-3">
              <KindBadge kind={i.kind} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-900">{i.title}</div>
                {i.kind === "text" && i.content && (
                  <div className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-zinc-600">
                    {i.content}
                  </div>
                )}
                {i.kind === "pdf" && i.path && (
                  <a
                    href={`/api/files/${i.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    Открыть PDF →
                  </a>
                )}
                {i.kind === "link" && i.url && (
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block break-all text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    {i.url}
                  </a>
                )}
              </div>
              <form action={deleteInstructionAction}>
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="customerId" value={customerId} />
                <input type="hidden" name="poolId" value={poolId} />
                <input type="hidden" name="instructionId" value={i.id} />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-red-700 transition hover:bg-red-50"
                >
                  Удалить
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {instructions.length === 0 && !open && (
        <p className="mt-4 text-sm text-zinc-500">
          Инструкций пока нет. Добавьте PDF, текст или ссылку.
        </p>
      )}
    </Card>
  );
}

function KindBadge({ kind }: { kind: InstructionKind }) {
  const styles: Record<InstructionKind, string> = {
    pdf: "bg-red-100 text-red-800",
    text: "bg-zinc-100 text-zinc-700",
    link: "bg-sky-100 text-sky-800",
  };
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles[kind]}`}>
      {KIND_LABEL[kind]}
    </span>
  );
}
