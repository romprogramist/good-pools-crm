import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unsubscribeDeviceAction } from "@/lib/server-actions/push";
import { Button } from "@/components/ui/button";

function deviceLabel(ua: string | null): string {
  if (!ua) return "Устройство без имени";
  if (/iPhone/.test(ua)) return "iPhone Safari";
  if (/iPad/.test(ua)) return "iPad Safari";
  if (/Android/.test(ua)) return /Chrome/.test(ua) ? "Android Chrome" : "Android browser";
  if (/Macintosh/.test(ua)) return /Chrome/.test(ua) ? "Mac Chrome" : /Firefox/.test(ua) ? "Mac Firefox" : "Mac Safari";
  if (/Windows/.test(ua)) return /Chrome/.test(ua) ? "Windows Chrome" : /Edg\//.test(ua) ? "Windows Edge" : /Firefox/.test(ua) ? "Windows Firefox" : "Windows";
  return ua.slice(0, 60);
}

export async function DevicesList() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { lastUsedAt: "desc" },
  });

  if (subs.length === 0) {
    return <p className="text-sm text-zinc-500">Нет подписанных устройств. Включи уведомления выше или в баннере на главной.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200">
      {subs.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <div className="font-medium text-zinc-900">{deviceLabel(s.userAgent)}</div>
            <div className="text-xs text-zinc-500">
              Подписано {s.createdAt.toLocaleDateString("ru-RU")} · Последняя доставка {s.lastUsedAt.toLocaleDateString("ru-RU")}
            </div>
          </div>
          <form action={unsubscribeDeviceAction.bind(null, s.endpoint)}>
            <Button type="submit" variant="outline" size="sm">Отозвать</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
