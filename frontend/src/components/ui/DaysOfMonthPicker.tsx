"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Calendar, { useToday } from "@/components/ui/Calendar";
import CalendarPopup from "@/components/ui/CalendarPopup";
import { daysInMonth, isoDate } from "@/lib/calendar";

interface Props {
  id?: string;
  /** Days of the month (1–31) the bill is paid on, repeated every cycle. */
  value: number[];
  /** The bill's first month: the calendar opens on it and can browse its year. */
  year: number;
  month: number; // 1–12
  /** Months between payment months (Repeat every): 1 monthly, 3 quarterly, 12 yearly. */
  stepMonths: number;
  onChange: (days: number[]) => void;
}

/** Same calendar as every other picker; clicking a date toggles its day number. */
export default function DaysOfMonthPicker({ id, value, year, month, stepMonths, onChange }: Props) {
  const t = useTranslations("BillTemplateForm");
  const today = useToday();
  const start = `${year}-${String(month).padStart(2, "0")}`;
  const [view, setView] = useState(start);
  // The starting month changed: show it again right away, not only on the next open
  const [seenStart, setSeenStart] = useState(start);
  if (seenStart !== start) {
    setSeenStart(start);
    setView(start);
  }
  const vy = Number(view.slice(0, 4));
  const vm = Number(view.slice(5, 7));
  const last = daysInMonth(vy, vm);
  const shown = (d: number) => Math.min(d, last); // day 31 shows on the 28th of February

  // Months before the start, or that Repeat every skips, carry no payment
  const monthsFromStart = (vy - year) * 12 + (vm - month);
  const paidMonth = monthsFromStart >= 0 && monthsFromStart % stepMonths === 0;

  function toggle(iso: string) {
    const day = Number(iso.slice(8, 10));
    const hit = value.some((d) => shown(d) === day);
    onChange(hit ? value.filter((d) => shown(d) !== day) : [...value, day].sort((a, b) => a - b));
  }

  return (
    <div>
      <CalendarPopup id={id} label={[...value].sort((a, b) => a - b).join(", ") || t("pickDays")} onToggle={() => setView(start)}>
        {() => (
          <div>
            <Calendar
            year={vy}
            month={vm}
            today={today}
            selected={value.map((d) => isoDate(vy, vm, shown(d)))}
            title
            nav={{ onChange: setView, min: `${year}-01`, max: `${year}-12` }}
            onSelect={toggle}
          />
            {!paidMonth && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("offCycleMonth")}</p>}
          </div>
        )}
      </CalendarPopup>
      {value.some((d) => d > 28) && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t("shortMonthNote")}</p>
      )}
    </div>
  );
}
