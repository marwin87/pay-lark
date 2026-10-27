"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/summary";
import MonthSheet from "@/components/payments/MonthSheet";
import Stepper, { StepperTitle, monthRelative } from "@/components/ui/Stepper";

interface Props {
  month: string;
  currentMonth: string;
  /** Earliest month that can be browsed, "YYYY-MM". */
  minMonth: string;
  /** Latest month that can be browsed, "YYYY-MM". */
  maxMonth: string;
  monthLabel: string;
  onChange: (month: string) => void;
}

/** The month card's title with prev/next arrows built in; on mobile the title opens the month picker. */
export default function MonthNav({ month, currentMonth, minMonth, maxMonth, monthLabel, onChange }: Props) {
  const t = useTranslations("Dashboard.nav");
  const locale = useLocale();
  const [sheetOpen, setSheetOpen] = useState(false);
  const atCurrent = month === currentMonth;
  return (
    <div className="max-sm:contents sm:flex sm:flex-wrap sm:items-center sm:gap-2">
      <Stepper
        onPrev={() => onChange(shiftMonth(month, -1))}
        onNext={() => onChange(shiftMonth(month, 1))}
        prevDisabled={month <= minMonth}
        nextDisabled={month >= maxMonth}
        prevLabel={t("prev")}
        nextLabel={t("next")}
        onPrevYear={() => onChange(shiftMonth(month, -12))}
        onNextYear={() => onChange(shiftMonth(month, 12))}
        prevYearDisabled={shiftMonth(month, -12) < minMonth}
        nextYearDisabled={shiftMonth(month, 12) > maxMonth}
        prevYearLabel={t("prevYear")}
        nextYearLabel={t("nextYear")}
      >
        <StepperTitle id="month-summary-title" title={monthLabel} subtitle={monthRelative(month, currentMonth, locale)} onOpen={() => setSheetOpen(true)} />
      </Stepper>
      {/* Mobile: always laid out (hidden at current month) so the card never changes height */}
      <button
        type="button"
        onClick={() => onChange(currentMonth)}
        className={`${atCurrent ? "invisible sm:hidden" : ""} max-sm:h-9 max-sm:justify-self-start rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50`}
      >
        {t("today")}
      </button>
      {sheetOpen && (
        <MonthSheet
          year={Number(month.slice(0, 4))}
          selectedMonth={month}
          currentMonth={currentMonth}
          minYear={Number(minMonth.slice(0, 4))}
          maxYear={Number(maxMonth.slice(0, 4))}
          locale={locale}
          onPick={(key) => {
            onChange(key);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
