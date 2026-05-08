"use client";

import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";

export type CalendarVisit = {
  id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  serviceUserId: string;
  serviceUserName: string;
  customerName: string;
  poolName: string;
  status: "planned" | "in_progress" | "completed";
};

const PALETTE = [
  "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444",
  "#a855f7", "#14b8a6", "#ec4899", "#6366f1",
];

function colorFor(serviceUserId: string): string {
  let h = 0;
  for (let i = 0; i < serviceUserId.length; i++) {
    h = (h * 31 + serviceUserId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function CalendarView({
  visits,
  initialView = "timeGridWeek",
  initialDate,
}: {
  visits: CalendarVisit[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";
  initialDate?: string;
}) {
  const router = useRouter();
  const events = visits.map((v) => ({
    id: v.id,
    title: `${v.customerName} — ${v.poolName}\n${v.serviceUserName}`,
    start: v.start,
    end: v.end,
    backgroundColor: colorFor(v.serviceUserId),
    borderColor: colorFor(v.serviceUserId),
    extendedProps: { status: v.status },
  }));

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={initialView}
      initialDate={initialDate}
      locale="ru"
      firstDay={1}
      timeZone="Europe/Moscow"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      }}
      buttonText={{
        today: "Сегодня",
        month: "Месяц",
        week: "Неделя",
        day: "День",
        list: "Список",
      }}
      events={events}
      eventClick={(info) => router.push(`/service/visits/${info.event.id}`)}
      dateClick={(info) =>
        router.push(`/service/calendar/new?date=${encodeURIComponent(info.dateStr)}`)
      }
      height="auto"
    />
  );
}
