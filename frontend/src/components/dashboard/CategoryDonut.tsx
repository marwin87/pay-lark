"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { categoryLabel, categoryStrokeClass, CATEGORY_COLOR_SWATCH, type CategoryColor } from "@/lib/categories";
import { formatMoney, type CategoryTotal } from "@/lib/summary";
import { CARD_CLASS } from "./MonthSummaryCard";

const R = 76;
const CIRC = 2 * Math.PI * R;
const GAP = 1; // px of space between segments

export default function CategoryDonut({ rows, currency, monthLabel, embedded = false }: { rows: CategoryTotal[]; currency: string; monthLabel: string; embedded?: boolean }) {
  const t = useTranslations("Dashboard.categories");
  const tCat = useTranslations("Categories");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const money = (v: number) => formatMoney(v, currency, locale, decimalSeparator);

  const total = rows.reduce((s, r) => s + r.total, 0);
  const selected = rows.find((r) => r.category.id === selectedId) ?? null;
  // Start of each segment along the ring, as a running sum of the previous lengths.
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((sum, r) => sum + (r.total / total) * CIRC, 0));

  return (
    <section className={embedded ? undefined : CARD_CLASS} aria-labelledby={`category-donut-title-${currency}`}>
      <h2 id={`category-donut-title-${currency}`} className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {t("title")}
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</p>
      ) : (
        <div className="grid items-center gap-5">
          <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[160px] lg:max-w-[220px]" role="img" aria-label={t("chartLabel")}>
            {rows.map((r, i) => {
              const len = (r.total / total) * CIRC;
              const dash = Math.max(len - GAP, 0.1);
              return (
                <circle
                  key={r.category.id}
                  cx={100}
                  cy={100}
                  r={R}
                  fill="none"
                  strokeWidth={selectedId === r.category.id ? 34 : 28}
                  strokeDasharray={`${dash} ${CIRC - dash}`}
                  strokeDashoffset={-starts[i]}
                  transform="rotate(-90 100 100)"
                  opacity={selectedId && selectedId !== r.category.id ? 0.3 : 1}
                  className={`donut-seg cursor-pointer transition-opacity ${categoryStrokeClass(r.category.color)}`}
                  onClick={() => setSelectedId(selectedId === r.category.id ? null : r.category.id)}
                />
              );
            })}
            <text x={100} y={98} textAnchor="middle" className="fill-slate-800 text-[18px] font-semibold dark:fill-slate-100">
              {money(selected ? selected.total : total)}
            </text>
            <text x={100} y={117} textAnchor="middle" className="fill-slate-500 text-[11px] dark:fill-slate-400">
              {selected ? categoryLabel(selected.category, tCat) : monthLabel}
            </text>
          </svg>

          <ul className="flex min-w-0 flex-col gap-0.5">
            {rows.map((r) => {
              const pctPaid = r.total ? (r.paid / r.total) * 100 : 0;
              const active = selectedId === r.category.id;
              return (
                <li key={r.category.id} className="donut-swatch">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(active ? null : r.category.id)}
                    className={`grid w-full grid-cols-[10px_1fr_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                      active ? "bg-slate-50 dark:bg-slate-700/50" : ""
                    }`}
                  >
                    <span className={`donut-dot h-2.5 w-2.5 rounded-sm ${CATEGORY_COLOR_SWATCH[r.category.color as CategoryColor] ?? CATEGORY_COLOR_SWATCH.slate}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-800 dark:text-slate-100">
                        {categoryLabel(r.category, tCat)}
                      </span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500">
                        {t("paidOf", { paid: money(r.paid), total: money(r.total) })}
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <span className="block h-full bg-emerald-500 dark:bg-emerald-600" style={{ width: `${pctPaid}%` }} />
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                      {Math.round((r.total / total) * 100)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
