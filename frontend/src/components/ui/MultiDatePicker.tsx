"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Calendar, { useToday } from "@/components/ui/Calendar";
import CalendarPopup from "@/components/ui/CalendarPopup";
import { formatDate } from "@/lib/calendar";

interface Props {
  value: string[]; // YYYY-MM-DD, any order
  onChange: (dates: string[]) => void;
  /** Dates that cannot be removed (already paid). */
  lockedDates?: string[];
}

/** Picks any number of dates across months; the popup stays open while you click. */
export default function MultiDatePicker({ value, onChange, lockedDates = [] }: Props) {
  const t = useTranslations("BillTemplateForm");
  const locale = useLocale();
  const today = useToday();
  const sorted = [...value].sort();
  const home = () => (sorted[0] ?? today).slice(0, 7);
  const [view, setView] = useState(home);

  function toggle(iso: string) {
    if (lockedDates.includes(iso)) return;
    onChange(value.includes(iso) ? value.filter((d) => d !== iso) : [...value, iso]);
  }

  const chip = (iso: string) =>
    formatDate(locale, Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div>
      <CalendarPopup label={t("datesCount", { count: value.length })} onToggle={() => setView(home())}>
        {() => (
          <Calendar
            year={Number(view.slice(0, 4))}
            month={Number(view.slice(5, 7))}
            today={today}
            selected={value}
            title
            nav={{ onChange: setView }}
            getDay={(iso) => ({ disabled: lockedDates.includes(iso) })}
            onSelect={toggle}
          />
        )}
      </CalendarPopup>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sorted.map((iso) => (
          <span
            key={iso}
            className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
          >
            {chip(iso)}
            {lockedDates.includes(iso) ? (
              <span className="pr-1.5 text-[10px] uppercase tracking-wide opacity-70">{t("paidDate")}</span>
            ) : (
              <button
                type="button"
                onClick={() => toggle(iso)}
                aria-label={t("removeDate", { date: chip(iso) })}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-green-100 dark:hover:bg-green-900/50"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
