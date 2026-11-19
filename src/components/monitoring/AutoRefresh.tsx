"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Обновляет серверные данные страницы без перезагрузки — экран можно держать открытым как табло. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);

  useEffect(() => {
    const stamp = () =>
      setAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    stamp();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      stamp();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
      </span>
      Обновляется само{at ? ` · ${at}` : ""}
    </span>
  );
}
