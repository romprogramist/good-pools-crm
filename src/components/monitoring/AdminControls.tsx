"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createControllerAction,
  regenerateTokenAction,
  type ControllerCreds,
  type ControllerFormState,
} from "@/lib/server-actions/monitoring";
import { buildEngineerMemo } from "@/lib/monitoring/memo";

const inputCls =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export function CopyButton({
  text,
  label = "Скопировать",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http без TLS или старый браузер — запасной способ
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-50"
      }
    >
      {done ? "✓ Скопировано" : label}
    </button>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-zinc-900 ring-1 ring-zinc-200">
        {value}
      </code>
      <CopyButton text={value} />
    </div>
  );
}

/** Показывается один раз сразу после создания контроллера или выпуска нового токена. */
export function CredsPanel({ creds, title }: { creds: ControllerCreds; title: string }) {
  const memo = buildEngineerMemo(creds);
  return (
    <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200 sm:p-6">
      <h3 className="text-lg font-semibold text-emerald-950">{title}</h3>
      <p className="mt-1 text-sm text-emerald-900">
        Передайте эти данные инженеру. <span className="font-semibold">Токен показан один раз</span> — после
        закрытия страницы его не посмотреть, можно только выпустить новый.
      </p>

      <div className="mt-4 space-y-3">
        <CredRow label="Адрес" value={creds.url} />
        <CredRow label="Токен" value={creds.token} />
        <CredRow label="controller_id" value={creds.externalId} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <CopyButton
          text={memo}
          label="Скопировать памятку для инженера целиком"
          className="inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        />
        <span className="text-xs text-emerald-900">
          В памятке — адрес, токен, форматы сообщений и команда для проверки. Её можно вставить в мессенджер.
        </span>
      </div>
    </div>
  );
}

export function NewControllerForm({ customers }: { customers: { id: string; fullName: string }[] }) {
  const [state, action, pending] = useActionState<ControllerFormState, FormData>(createControllerAction, {});

  if (state.creds) {
    return (
      <div className="mt-6 space-y-4">
        <CredsPanel creds={state.creds} title={`Контроллер «${state.creds.name}» создан`} />
        <Link
          href="/admin/monitoring"
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
        >
          Готово, я всё скопировал
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Новый контроллер</h2>
        <Link href="/admin/monitoring" className="text-sm text-zinc-500 hover:text-zinc-900">
          Закрыть
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Один контроллер — один объект. Зоны (бассейн, джакузи, купель) появятся сами из его сообщений.
      </p>

      <form action={action} className="mt-5 space-y-4">
        {state.error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">{state.error}</div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-name" className="text-sm font-medium text-zinc-700">
            Название объекта
          </label>
          <input
            id="mc-name"
            name="name"
            required
            maxLength={160}
            placeholder="Например: Дом на Курортном, 12"
            className={inputCls}
          />
          <p className="text-xs text-zinc-500">Так объект будет называться в списке и в уведомлениях.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-customer" className="text-sm font-medium text-zinc-700">
            Клиент <span className="font-normal text-zinc-400">— необязательно</span>
          </label>
          <select id="mc-customer" name="customerId" defaultValue="" className={inputCls}>
            <option value="">Не привязывать</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-notes" className="text-sm font-medium text-zinc-700">
            Заметка <span className="font-normal text-zinc-400">— необязательно</span>
          </label>
          <input
            id="mc-notes"
            name="notes"
            maxLength={1000}
            placeholder="Кто настраивал, контакт инженера и т. п."
            className={inputCls}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {pending ? "Создаём…" : "Создать и получить доступ"}
          </button>
          <Link
            href="/admin/monitoring"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}

export function RegenerateToken({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<ControllerFormState, FormData>(regenerateTokenAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.creds) {
    return <CredsPanel creds={state.creds} title={`Новый токен для «${name}»`} />;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
      >
        Выпустить новый токен
      </button>
    );
  }

  return (
    <form action={action} className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-amber-950">
        Старый токен сразу перестанет работать — контроллер не сможет присылать данные, пока инженер не
        пропишет новый. Продолжить?
      </p>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {pending ? "Выпускаем…" : "Да, выпустить новый"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-700 transition hover:bg-white"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
