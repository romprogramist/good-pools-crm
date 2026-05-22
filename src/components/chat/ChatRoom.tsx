"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendChatMessageAction } from "@/lib/server-actions/chat";
import type { ChatMessageDTO } from "@/lib/chat";

const POLL_INTERVAL_MS = 5000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatRoom({
  threadId,
  initialMessages,
  currentUserId,
}: {
  threadId: string;
  initialMessages: ChatMessageDTO[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${threadId}/messages`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessageDTO[] };
        setMessages(data.messages);
      }
    } catch {
      // тихо игнорируем сетевые сбои поллинга
    }
  }, [threadId]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const body = text.trim();
    if (!body && files.length === 0) return;
    setError(null);

    const fd = new FormData();
    fd.set("threadId", threadId);
    fd.set("body", body);
    for (const f of files) fd.append("files", f);

    startTransition(async () => {
      const result = await sendChatMessageAction(fd);
      if (result.ok) {
        setText("");
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await refresh();
      } else {
        setError(result.error ?? "Не удалось отправить сообщение");
      }
    });
  }

  return (
    <div className="mt-6 flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex h-[60vh] flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="m-auto text-sm text-zinc-400">
            Сообщений пока нет. Напишите первым.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div
              key={m.id}
              className={mine ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  mine
                    ? "max-w-[80%] rounded-2xl rounded-br-sm bg-teal-600 px-3.5 py-2 text-sm text-white"
                    : "max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900"
                }
              >
                {!mine && (
                  <div className="mb-0.5 text-xs font-medium text-zinc-500">
                    {m.senderName}
                  </div>
                )}
                {m.body && (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                )}
                {m.photos.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.photos.map((p) => (
                      <a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt="вложение"
                          className="h-28 w-28 rounded-lg object-cover ring-1 ring-black/10"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div
                  className={
                    mine
                      ? "mt-1 text-right text-[11px] text-teal-100"
                      : "mt-1 text-right text-[11px] text-zinc-400"
                  }
                >
                  {formatTime(m.createdAt)}
                  {mine && (m.readAt ? " · прочитано" : " · отправлено")}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 p-3 sm:p-4">
        {error && (
          <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-2 text-xs text-zinc-500">
            Вложений: {files.length}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Сообщение…"
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          />
          <label className="inline-flex h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50">
            Фото
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <Button
            type="button"
            onClick={handleSend}
            disabled={pending}
            className="h-11 bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {pending ? "…" : "Отправить"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Enter — отправить, Shift+Enter — перенос строки.
        </p>
      </div>
    </div>
  );
}
