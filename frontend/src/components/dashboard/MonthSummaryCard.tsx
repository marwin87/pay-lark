"use client";

import type { ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { formatMoney, type MonthSummary } from "@/lib/summary";

interface Props {
  summary: MonthSummary;
  currency: string;
  /** The card's title row content (month label, optionally with navigation). */
  title: ReactNode;
}

export const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700";

export default function MonthSummaryCard({ summary, currency, title }: Props) {
  const t = useTranslations("Dashboard.summary");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const money = (v: number) => formatMoney(v, currency, locale, decimalSeparator);
  const total = summary.paid + summary.overdue + summary.upcoming;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  const count = summary.paidCount + summary.overdueCount + summary.upcomingCount;

  const stats = [
    { key: "paid", label: t("paid"), value: summary.paid, n: summary.paidCount, dot: "bg-emerald-500", text: "text-slate-800 dark:text-slate-100" },
    { key: "overdue", label: t("overdue"), value: summary.overdue, n: summary.overdueCount, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
    { key: "upcoming", label: t("upcoming"), value: summary.upcoming, n: summary.upcomingCount, dot: "bg-blue-400", text: "text-slate-800 dark:text-slate-100" },
  ];

  return (
    <section className={CARD_CLASS} aria-labelledby="month-summary-title">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
        {title}
        <span className="col-start-2 flex items-center justify-self-end text-xs text-slate-400 dark:text-slate-500 sm:block">
          {t("counts", { paid: summary.paidCount, total: count })}
        </span>
      </div>

      {count === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</p>
      ) : (
        <>
          <p className="text-3xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {money(summary.paid)}
            <span className="ml-2 text-base font-normal text-slate-500 dark:text-slate-400">
              {t("of", { total: money(total) })}
            </span>
          </p>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t("paidLabel")}</p>

          <div
            className="mb-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
            role="img"
            aria-label={t("barLabel", { percent: Math.round(pct(summary.paid)) })}
          >
            <div className="bg-emerald-500 dark:bg-emerald-600" style={{ width: `${pct(summary.paid)}%` }} />
            <div className="bg-red-500 dark:bg-red-500" style={{ width: `${pct(summary.overdue)}%` }} />
            <div className="bg-blue-400 dark:bg-blue-500" style={{ width: `${pct(summary.upcoming)}%` }} />
          </div>

          <dl className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className={`break-words text-sm font-medium tabular-nums ${s.text}`}>{money(s.value)}</dd>
                <dd className="text-xs text-slate-400 dark:text-slate-500">{t("bills", { count: s.n })}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
            <span className="text-sm text-slate-500 dark:text-slate-400">{t("remaining")}</span>
            <span className="text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {money(summary.overdue + summary.upcoming)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
