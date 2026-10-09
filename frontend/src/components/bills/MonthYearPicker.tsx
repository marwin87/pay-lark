"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { CalendarHeader, useToday } from "@/components/ui/Calendar";
import CalendarPopup from "@/components/ui/CalendarPopup";
import { formatDate } from "@/lib/calendar";

interface Props {
  id?: string;
  value: string; // "YYYY-MM" or "" when unset
  min?: string; // "YYYY-MM" — earlier months are disabled
  disabled?: boolean; // shows the value but cannot change it
  clearable?: boolean; // shows the clear button when a value is set (default true)
  onChange: (value: string) => void;
}

// Same popup and header as DatePicker, but picks a month + year (no day) and can be cleared.
export default function MonthYearPicker({ id, value, min, disabled, clearable = true, onChange }: Props) {
  const locale = useLocale();
  const thisYear = Number(useToday().slice(0, 4));
  const [selYear, selMonth] = value ? value.split("-").map(Number) : [0, 0];
  const [viewYear, setViewYear] = useState(value ? selYear : thisYear);
  const minYear = min ? Number(min.slice(0, 4)) : -Infinity;

  const label = (m: number, opts: Intl.DateTimeFormatOptions) => formatDate(locale, viewYear, m, 1, opts);

  return (
    <CalendarPopup
      id={id}
      disabled={disabled}
      label={value ? formatDate(locale, selYear, selMonth, 1, { month: "long", year: "numeric" }) : "---"}
      onToggle={() => setViewYear(value ? selYear : thisYear)}
      trailing={clearable && value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X size={14} />
        </button>
      )}
    >
      {(close) => (
        <>
          <CalendarHeader
            title={String(viewYear)}
            showNav
            onPrev={() => setViewYear((y) => y - 1)}
            onNext={() => setViewYear((y) => y + 1)}
            prevDisabled={viewYear <= minYear}
          />
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const ym = `${viewYear}-${String(m).padStart(2, "0")}`;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(ym); close(); }}
                  disabled={!!min && ym < min}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm capitalize transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:disabled:text-slate-600 ${
                    ym === value
                      ? "bg-green-700 font-semibold text-white"
                      : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                  }`}
                >
                  {label(m, { month: "short" })}
                </button>
              );
            })}
          </div>
        </>
      )}
    </CalendarPopup>
  );
}
