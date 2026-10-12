"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAV_BTN } from "@/components/ui/Stepper";

interface Props {
  year: number;
  selectedMonth: string;
  currentMonth: string;
  minYear: number;
  maxYear: number;
  locale: string;
  onPick: (month: string) => void;
  onClose: () => void;
}

/** Mobile month picker: bottom sheet with a year stepper and a 4×3 month grid. */
export default function MonthSheet({ year, selectedMonth, currentMonth, minYear, maxYear, locale, onPick, onClose }: Props) {
  const t = useTranslations("PaymentsPage");
  const [viewYear, setViewYear] = useState(year);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("pickMonth")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="w-full rounded-t-2xl border border-slate-200 bg-white px-4 pb-6 pt-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-center justify-between">
          <button autoFocus className={NAV_BTN} aria-label={t("previousYear")} disabled={viewYear <= minYear} onClick={() => setViewYear(viewYear - 1)}>
            <ChevronLeft size={20} />
          </button>
          <span className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">{viewYear}</span>
          <button className={NAV_BTN} aria-label={t("nextYear")} disabled={viewYear >= maxYear} onClick={() => setViewYear(viewYear + 1)}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
            const label = new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(viewYear, i));
            return (
              <button
                key={key}
                onClick={() => onPick(key)}
                className={`rounded-xl py-3.5 text-sm font-medium ${
                  key === selectedMonth
                    ? "bg-green-100 text-green-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : key === currentMonth
                    ? "text-green-700 dark:text-emerald-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
