"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { formatMoney, type MonthSummary } from "@/lib/summary";
import type { TrendPoint } from "@/lib/payments-api";
import CategoryDonut from "./CategoryDonut";
import TrendChart from "./TrendChart";

export interface CurrencyRow {
  currency: string;
  summary: MonthSummary | null;
}

interface Props {
  /** One row per currency, those with bills this month first. */
  rows: CurrencyRow[];
  trend: TrendPoint[];
  /** The month shown, "YYYY-MM", and the range the trend chart can reach. */
  month: string;
  minMonth: string;
  maxMonth: string;
  monthLabel: string;
  onSelectMonth: (month: string) => void;
  /** The card's title row content (month label with navigation). */
  title: ReactNode;
  /** Spread on the header, e.g. the swipe handlers for changing month. */
  headerProps?: HTMLAttributes<HTMLDivElement>;
}

export const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700";

const countOf = (s: MonthSummary) => s.paidCount + s.overdueCount + s.upcomingCount;

/** The month at a glance: one compact row per currency; a row opens to its categories and trend. */
export default function MonthSummaryCard({
  rows, trend, month, minMonth, maxMonth, monthLabel, onSelectMonth, title, headerProps,
}: Props) {
  const t = useTranslations("Dashboard.summary");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const paidCount = rows.reduce((n, r) => n + (r.summary?.paidCount ?? 0), 0);
  const count = rows.reduce((n, r) => n + (r.summary ? countOf(r.summary) : 0), 0);

  return (
    <section className={`${CARD_CLASS} !p-0 overflow-hidden`} aria-labelledby="month-summary-title">
      <div
        {...headerProps}
        className="grid grid-cols-2 gap-2 p-4 sm:flex sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between"
      >
        {title}
        <span className="col-start-2 flex items-center justify-self-end text-xs text-slate-400 dark:text-slate-500 sm:block">
          {t("counts", { paid: paidCount, total: count })}
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
        {[
          ["bg-emerald-500", t("paid")],
          ["bg-red-500", t("overdue")],
          ["bg-blue-400", t("upcoming")],
        ].map(([dot, label]) => (
          <li key={dot} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {label}
          </li>
        ))}
      </ul>

      {rows.map(({ currency, summary }) => {
        // A lone currency starts open; with several, everything starts folded.
        const isOpen = open[currency] ?? rows.length === 1;
        return (
          <div
            key={currency}
            className={`border-t border-slate-100 dark:border-slate-700 ${isOpen ? "bg-green-50/70 dark:bg-green-900/15" : ""}`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen({ ...open, [currency]: !isOpen })}
              className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
            >
              <CurrencyRowHead currency={currency} summary={summary} isOpen={isOpen} />
            </button>
            {isOpen && (
              <div className="grid gap-6 px-4 pb-4 pt-4 lg:grid-cols-[2fr_3fr]">
                <CategoryDonut
                  embedded
                  rows={summary?.byCategory ?? []}
                  currency={currency}
                  monthLabel={monthLabel}
                />
                <TrendChart
                  embedded
                  points={trend}
                  currency={currency}
                  month={month}
                  minMonth={minMonth}
                  maxMonth={maxMonth}
                  onSelectMonth={onSelectMonth}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function CurrencyRowHead({ currency, summary, isOpen }: { currency: string; summary: MonthSummary | null; isOpen: boolean }) {
  const t = useTranslations("Dashboard.summary");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const money = (v: number) => formatMoney(v, currency, locale, decimalSeparator);
  const total = summary ? summary.paid + summary.overdue + summary.upcoming : 0;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);

  return (
    <div className="grid grid-cols-[3rem_1fr_auto_1rem] items-center gap-x-3 gap-y-1">
      <span className="font-bold text-slate-800 dark:text-slate-100">{currency}</span>
      {summary && total > 0 ? (
        <>
          <div className="min-w-0">
            <div
              className="flex h-1.5 gap-px overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
              role="img"
              aria-label={t("barLabel", { percent: Math.round(pct(summary.paid)) })}
            >
              <div className="bg-emerald-500 dark:bg-emerald-600" style={{ width: `${pct(summary.paid)}%` }} />
              <div className="bg-red-500" style={{ width: `${pct(summary.overdue)}%` }} />
              <div className="bg-blue-400 dark:bg-blue-500" style={{ width: `${pct(summary.upcoming)}%` }} />
            </div>
            <p className="mt-1 truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {money(summary.paid)} {t("of", { total: money(total) })} · {t("paidLabel")}
            </p>
          </div>
          <div className="text-right">
            <p className={`font-semibold tabular-nums ${summary.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}>
              {money(summary.overdue + summary.upcoming)}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t("remaining")}</p>
          </div>
        </>
      ) : (
        <p className="col-span-2 text-sm text-slate-500 dark:text-slate-400">{t("empty")}</p>
      )}
      <span aria-hidden className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
    </div>
  );
}
