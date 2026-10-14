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
import { fetchMe } from "@/lib/user-api";
import { getCached, setCached } from "@/lib/page-cache";
import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { currenciesByVolume, pickCurrency, shiftMonth, summarize } from "@/lib/summary";
import MonthSummaryCard, { CARD_CLASS } from "@/components/dashboard/MonthSummaryCard";
import CategoryDonut from "@/components/dashboard/CategoryDonut";
import TrendChart from "@/components/dashboard/TrendChart";
import OnboardingChecklist from "@/components/help/OnboardingChecklist";
import CurrencySwitch from "@/components/dashboard/CurrencySwitch";
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
    defaultCurrency: string | null;
  } | null>(() => getCached(`dashboard:${currentMonth}`) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Sync first so this month's payments exist, exactly like the Payments page.
    // Past months are history: never generate instances for them.
    (month >= currentMonth ? syncInstances(month).catch(() => {}) : Promise.resolve())
      .then(() =>
        Promise.all([
          fetchPayments(month),
          fetchTrend(month),
          fetchMe().then((me) => me.default_currency).catch(() => null),
        ]),
      )
      .then(([instances, trend, defaultCurrency]) => {
        if (cancelled) return;
        const next = { month, instances, trend, defaultCurrency };
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

  const currencies = data ? currenciesByVolume(data.instances, data.trend) : [];
  const currency = data ? pickCurrency(selectedCurrency, currencies, data.defaultCurrency) : null;
  const summary = data && currency ? summarize(data.instances, currency) : null;
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
      {data && !currency && (
        // No payments in any currency for this window: keep the month nav so you can go back
        <section className={`${CARD_CLASS} max-sm:grid max-sm:grid-cols-2 max-sm:gap-2`} {...swipe}>
          <MonthNav month={month} currentMonth={currentMonth} minMonth={minMonth} maxMonth={maxMonth} monthLabel={monthLabel} onChange={setMonth} />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyMonth")}</p>
          {month >= currentMonth && (
            <>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyHelp")}</p>
              <Link href="/dashboard/bills" className={`mt-4 ${btnPrimaryClass}`}>
                {t("summary.addBill")}
              </Link>
            </>
          )}
        </section>
      )}
      {data && summary && currency && (
        <div className="mb-8 flex flex-col gap-4">
          {currencies.length > 1 && (
            <CurrencySwitch
              currencies={currencies}
              active={currenciesByVolume(data.instances, [])}
              value={currency}
              onChange={setSelectedCurrency}
              label={t("summary.currency")}
            />
          )}
          <div {...swipe}>
            <MonthSummaryCard
              summary={summary}
              currency={currency}
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
          <div className="grid gap-4 xl:grid-cols-2">
            <CategoryDonut rows={summary.byCategory} currency={currency} monthLabel={monthLabel} />
            <TrendChart onSelectMonth={setMonth} points={data.trend} currency={currency} month={shownMonth} minMonth={minMonth} maxMonth={maxMonth} />
          </div>
        </div>
      )}
    </div>
  );
}
