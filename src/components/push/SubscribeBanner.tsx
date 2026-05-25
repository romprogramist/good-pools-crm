"use client";

import { useEffect, useState } from "react";
import { SubscribeButton } from "./SubscribeButton";
import { isPushSupported, isIosWithoutPwa } from "@/lib/push/client-utils";

const DISMISS_KEY = "push.banner.dismissedUntil";
const DISMISS_DAYS = 7;

type State =
  | "loading"
  | "hidden"
  | "ask"
  | "denied"
  | "ios-needs-pwa";

export function SubscribeBanner() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) { if (!cancelled) setState("hidden"); return; }
      if (isIosWithoutPwa()) { if (!cancelled) setState("ios-needs-pwa"); return; }

      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (Date.now() < dismissedUntil) { if (!cancelled) setState("hidden"); return; }

      if (Notification.permission === "denied") { if (!cancelled) setState("denied"); return; }

      if (Notification.permission === "granted") {
        // Active subscription for this endpoint?
        try {
          const reg = await navigator.serviceWorker.getRegistration("/sw.js");
          const sub = await reg?.pushManager.getSubscription();
          if (cancelled) return;
          if (sub) { setState("hidden"); return; }
        } catch { /* fallthrough */ }
      }

      if (!cancelled) setState("ask");
    })();
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setState("hidden");
  }

  if (state === "loading" || state === "hidden") return null;

  const wrap = "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm";

  if (state === "denied") {
    return (
      <div className={wrap}>
        <strong className="block">Уведомления заблокированы в браузере.</strong>
        <span className="text-zinc-700">
          Открой настройки сайта в браузере (значок замка слева от адресной строки) → «Уведомления» → «Разрешить».
        </span>
      </div>
    );
  }

  if (state === "ios-needs-pwa") {
    return (
      <div className={wrap}>
        <strong className="block">Уведомления на iPhone требуют установки приложения.</strong>
        <span className="text-zinc-700">
          В Safari нажми «Поделиться» → «На экран Домой», затем открой добавленную иконку и разреши уведомления.
        </span>
      </div>
    );
  }

  return (
    <div className={`${wrap} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <strong className="block">Включить уведомления?</strong>
        <span className="text-zinc-700">Будем присылать новые заявки, отчёты и сообщения из чата.</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={dismiss} className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-amber-100">
          Не сейчас
        </button>
        <SubscribeButton onSubscribed={() => setState("hidden")} label="Разрешить" />
      </div>
    </div>
  );
}
