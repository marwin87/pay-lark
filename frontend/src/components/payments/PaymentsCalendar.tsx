"use client";

import Calendar from "@/components/ui/Calendar";
import type { PaymentInstanceOut } from "@/lib/payments-api";

interface Props {
  year: number;
  month: number; // 1–12
  instances: PaymentInstanceOut[];
  todayStr: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

type DotStatus = "overdue" | "dueToday" | "upcoming" | "paid";

const STATUS_TILE: Record<DotStatus, string> = {
  overdue: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50",
  dueToday: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50",
  upcoming: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50",
  paid: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50",
};

function dayStatus(
  dayInstances: PaymentInstanceOut[],
  dateStr: string,
  todayStr: string,
): DotStatus | null {
  if (dayInstances.length === 0) return null;
  if (dayInstances.some((i) => i.status === "overdue")) return "overdue";
  if (dayInstances.some((i) => i.status === "upcoming")) {
    return dateStr === todayStr ? "dueToday" : "upcoming";
  }
  return "paid";
}

export default function PaymentsCalendar({
  year,
  month,
  instances,
  todayStr,
  selectedDay,
  onSelectDay,
}: Props) {
  const byDay = new Map<string, PaymentInstanceOut[]>();
  for (const inst of instances) {
    const list = byDay.get(inst.due_date);
    if (list) list.push(inst);
    else byDay.set(inst.due_date, [inst]);
  }

  return (
    <Calendar
      year={year}
      month={month}
      today={todayStr}
      selected={selectedDay}
      selectedStyle="ring"
      onSelect={onSelectDay}
      getDay={(iso, weekend) => {
        const dayInstances = byDay.get(iso) ?? [];
        const status = dayStatus(dayInstances, iso, todayStr);
        if (!status) {
          return { disabled: true, className: `cursor-default border text-slate-400 dark:text-slate-500 ${weekend ? "border-transparent bg-slate-100 dark:border-transparent dark:bg-slate-700/40" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/40"}` };
        }
        return {
          className: `${STATUS_TILE[status]} cursor-pointer text-xs font-medium hover:-translate-y-0.5 hover:shadow-sm`,
          badge: dayInstances.length > 1 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-white bg-slate-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm dark:border-slate-800 dark:bg-slate-300 dark:text-slate-800">
              {dayInstances.length}
            </span>
          ),
        };
      }}
    />
  );
}
