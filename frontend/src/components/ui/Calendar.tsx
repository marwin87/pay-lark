"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { daysInMonth, firstDayOffset, formatDate, isoDate, shiftMonth, weekdayHeaders } from "@/lib/calendar";
import { todayIn } from "@/lib/today";

/** "Today" (YYYY-MM-DD) in the profile's zone, the same calendar the backend uses. */
export function useToday(): string {
  return todayIn(useAppLocale().timeZone);
}

export interface DayState {
  disabled?: boolean;
  /** Replaces the default colours of the cell (selected/today styling still applies). */
  className?: string;
  badge?: ReactNode;
}

interface Props {
  year: number;
  month: number; // 1–12
  today: string; // YYYY-MM-DD
  /** One date, or several (multi-select pickers). */
  selected?: string | string[] | null;
  onSelect: (iso: string) => void;
  getDay?: (iso: string) => DayState;
  /** "fill": solid green cell (pickers). "ring": ring only, keeps getDay colours (status calendar). */
  selectedStyle?: "fill" | "ring";
  /** Month title above the grid. */
  title?: boolean;
  /** Shows prev/next arrows; `min`/`max` are "YYYY-MM" bounds. */
  nav?: { onChange: (ym: string) => void; min?: string; max?: string };
}

export const DAY_CELL = "relative flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors";
export const DAY_ENABLED = "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300";
export const DAY_DISABLED = "cursor-not-allowed text-slate-300 dark:text-slate-600";
const ARROW = "rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700";

/** Title + prev/next arrows. Shared with the month picker. */
export function CalendarHeader({ title, onPrev, onNext, prevDisabled, nextDisabled, showNav }: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  showNav: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      {showNav ? (
        <button type="button" onClick={onPrev} disabled={prevDisabled} className={ARROW}>
          <ChevronLeft size={16} />
        </button>
      ) : <span />}
      <span className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">{title}</span>
      {showNav ? (
        <button type="button" onClick={onNext} disabled={nextDisabled} className={ARROW}>
          <ChevronRight size={16} />
        </button>
      ) : <span />}
    </div>
  );
}

/** The one month grid every calendar in the app renders; instances switch features on via props. */
export default function Calendar({ year, month, today, selected, onSelect, getDay, selectedStyle = "fill", title, nav }: Props) {
  const locale = useLocale();
  const ym = isoDate(year, month, 1).slice(0, 7);

  return (
    <div>
      {(title || nav) && (
        <CalendarHeader
          title={formatDate(locale, year, month, 1, { month: "long", year: "numeric" })}
          showNav={!!nav}
          onPrev={() => nav?.onChange(shiftMonth(ym, -1))}
          onNext={() => nav?.onChange(shiftMonth(ym, 1))}
          prevDisabled={!!nav?.min && ym <= nav.min}
          nextDisabled={!!nav?.max && ym >= nav.max}
        />
      )}
      <div className="mb-1 grid grid-cols-7">
        {weekdayHeaders(locale).map((wd, i) => (
          <div key={i} className="flex h-6 items-center justify-center text-xs font-medium capitalize text-slate-400 dark:text-slate-500">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOffset(year, month) }, (_, i) => <div key={`gap-${i}`} />)}
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => {
          const iso = isoDate(year, month, d);
          const { disabled, className, badge } = getDay?.(iso) ?? {};
          const isSelected = Array.isArray(selected) ? selected.includes(iso) : selected === iso;
          const isToday = iso === today;
          const colours = isSelected && selectedStyle === "fill"
            ? "bg-green-700 font-semibold text-white"
            : className ?? (disabled ? DAY_DISABLED : DAY_ENABLED);
          const ring = isSelected && selectedStyle === "ring"
            ? "ring-2 ring-green-600 dark:ring-emerald-400"
            : isToday && !isSelected
              ? "ring-2 ring-inset ring-slate-500 dark:ring-slate-300"
              : "";
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              data-selected={isSelected || undefined}
              data-today={isToday || undefined}
              onClick={() => onSelect(iso)}
              className={`${DAY_CELL} ${colours} ${ring} ${isToday ? "font-bold" : ""}`}
            >
              {d}
              {badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}
