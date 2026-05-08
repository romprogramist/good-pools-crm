"use client";

import dynamic from "next/dynamic";
import { Card } from "@/components/Page";
import type { CalendarVisit } from "@/components/calendar/CalendarView";

const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView").then((m) => m.CalendarView),
  {
    ssr: false,
    loading: () => (
      <Card>
        <p className="text-sm text-zinc-500">Загрузка календаря…</p>
      </Card>
    ),
  },
);

type Props = {
  visits: CalendarVisit[];
  initialView: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";
  initialDate?: string;
};

export function CalendarViewLoader(props: Props) {
  return <CalendarView {...props} />;
}
