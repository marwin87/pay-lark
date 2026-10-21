"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { browseYears, monthIn } from "@/lib/today";
import { SessionExpiredError } from "@/lib/api";
import {
  fetchPayments,
  fetchTrend,
  syncInstances,
  type PaymentInstanceOut,
  type TrendPoint,
} from "@/lib/payments-api";
import { getCached, setCached } from "@/lib/page-cache";
import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { currenciesByVolume, shiftMonth, summarize } from "@/lib/summary";
import MonthSummaryCard, { CARD_CLASS } from "@/components/dashboard/MonthSummaryCard";
import OnboardingChecklist from "@/components/help/OnboardingChecklist";
import MonthNav from "@/components/dashboard/MonthNav";
import { useSwipe } from "@/hooks/useSwipe";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const { timeZone } = useAppLocale();
  const currentMonth = monthIn(timeZone);
  // Same reach as the Payments page, both ways.
  const { minYear, maxYear } = browseYears(Number(currentMonth.slice(0, 4)));
  const minMonth = `${minYear}-01`;
  const maxMonth = `${maxYear}-12`;
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<{
    month: string;
    instances: PaymentInstanceOut[];
    trend: TrendPoint[];
  } | null>(() => getCached(`dashboard:${currentMonth}`) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Sync first so this month's payments exist, exactly like the Payments page.
    // Past months are history: never generate instances for them.
    (month >= currentMonth ? syncInstances(month).catch(() => {}) : Promise.resolve())
      .then(() =>
        Promise.all([
          fetchPayments(month),
          fetchTrend(month),
        ]),
      )
      .then(([instances, trend]) => {
        if (cancelled) return;
        const next = { month, instances, trend };
        setCached(`dashboard:${month}`, next);
        setData(next);
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError || cancelled) return;
        setError(err instanceof Error ? err.message : t("summary.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, currentMonth, t]);

  // Swipe the summary card left/right (touch only) for the next/previous month
  const stepMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (next >= minMonth && next <= maxMonth) setMonth(next);
  };
  const swipe = useSwipe(() => stepMonth(1), () => stepMonth(-1));

  // Currencies with bills this month first (biggest first), then those that only have history.
  const currencies = data ? currenciesByVolume(data.instances, data.trend) : [];
  const activeNow = data ? currenciesByVolume(data.instances, []) : [];
  const rows = [...activeNow, ...currencies.filter((c) => !activeNow.includes(c))].map((c) => ({
    currency: c,
    summary: data ? summarize(data.instances, c) : null,
  }));
  // Label and chart follow the month the data was loaded for, not the one just clicked.
  const shownMonth = data?.month ?? month;
  const [yy, mm] = shownMonth.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(yy, mm - 1));

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <OnboardingChecklist currentMonth={currentMonth} />

      {error && (
        <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="mb-8 flex flex-col gap-4" aria-busy="true" aria-label={t("summary.loading")}>
          <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      )}
      {data && rows.length === 0 && (
        // No payments in any currency for this window: keep the month nav so you can go back
        <section className={CARD_CLASS} {...swipe}>
          <div className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
            <MonthNav month={month} currentMonth={currentMonth} minMonth={minMonth} maxMonth={maxMonth} monthLabel={monthLabel} onChange={setMonth} />
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyMonth")}</p>
          {month >= currentMonth && (
            <>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyHelp")}</p>
              <Link href="/dashboard/bills" className={`mt-4 max-sm:w-full ${btnPrimaryClass}`}>
                {t("summary.addBill")}
              </Link>
            </>
          )}
        </section>
      )}
      {data && rows.length > 0 && (
        <div className="mb-8">
          <MonthSummaryCard
            headerProps={swipe}
            rows={rows}
            trend={data.trend}
            month={shownMonth}
            minMonth={minMonth}
            maxMonth={maxMonth}
            monthLabel={monthLabel}
            onSelectMonth={setMonth}
            title={
              <MonthNav
                month={shownMonth}
                currentMonth={currentMonth}
                minMonth={minMonth} maxMonth={maxMonth}
                monthLabel={monthLabel}
                onChange={setMonth}
              />
            }
          />
        </div>
      )}
    </div>
  );
}
