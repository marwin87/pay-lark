"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { formatMoney, shiftMonth, trendPeriods } from "@/lib/summary";
import { fetchTrend, type TrendPoint } from "@/lib/payments-api";
import { CARD_CLASS } from "./MonthSummaryCard";
import Stepper, { StepperTitle } from "@/components/ui/Stepper";
import { useSwipe } from "@/hooks/useSwipe";

const W = 640;
const H = 268;
const LEFT = 8;
const TOP = 12;
const BASE = 205;

/** A round upper bound for the y axis (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

interface Props {
  points: TrendPoint[];
  currency: string;
  /** The dashboard's month, "YYYY-MM": the window starts out ending here (`points` cover it). */
  month: string;
  /** Earliest and latest month the year arrows can reach, "YYYY-MM". */
  minMonth: string;
  maxMonth: string;
  /** Called with "YYYY-MM" when a bar is clicked. */
  onSelectMonth: (month: string) => void;
}

export default function TrendChart({ points: initialPoints, currency, month, minMonth, maxMonth, onSelectMonth }: Props) {
  const t = useTranslations("Dashboard.trend");
  const tYear = useTranslations("PaymentsPage");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const money = (v: number) => formatMoney(v, currency, locale, decimalSeparator);
  const [active, setActive] = useState<number | null>(null);
  const monthName = (period: string, style: "short" | "long", withYear = false) => {
    const [yy, mm] = period.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, style === "short" && !withYear ? { month: "short" } : style === "short" ? { month: "short", year: "numeric" } : { month: "long", year: "numeric" }).format(new Date(yy, mm - 1));
  };
  // The window (year arrows, swipe) moves on its own; trend data is cached per window end so
  // clicking a bar (which changes `month`) doesn't reload the window it sits in.
  const [end, setEnd] = useState(month);
  const [cache, setCache] = useState<Record<string, TrendPoint[]>>({ [month]: initialPoints });
  const points = cache[end] ?? (end === month ? initialPoints : null);

  // The dashboard month changed (nav arrows, swipe, bar click): reset the hover, and bring the
  // window along only when the month fell outside it.
  const [seenMonth, setSeenMonth] = useState(month);
  const [seenPoints, setSeenPoints] = useState(initialPoints);
  if (seenMonth !== month) {
    setSeenMonth(month);
    setSeenPoints(initialPoints);
    setActive(null);
    setCache((c) => ({ ...c, [month]: initialPoints }));
    if (!trendPeriods(end).includes(month)) setEnd(month);
  } else if (seenPoints !== initialPoints) {
    // The dashboard refetched this month's trend (e.g. a payment changed since the cached
    // copy was shown): take the fresh data and drop windows fetched earlier, they reload on visit.
    setSeenPoints(initialPoints);
    setCache({ [month]: initialPoints });
  }

  useEffect(() => {
    if (points) return;
    let cancelled = false;
    fetchTrend(end).then((p) => !cancelled && setCache((c) => ({ ...c, [end]: p }))).catch(() => {});
    return () => { cancelled = true; };
  }, [end, points]);

  const periods = trendPeriods(end);
  const clamp = (m: string) => (m < minMonth ? minMonth : m > maxMonth ? maxMonth : m);
  const moveTo = (e: string) => { setEnd(e); setActive(null); };
  const nextEnd = clamp(shiftMonth(end, 12));
  const prevEnd = clamp(shiftMonth(end, -12));
  // Touch swipe = the year arrows: left for the next year, right for the previous
  const swipe = useSwipe(() => moveTo(nextEnd), () => moveTo(prevEnd));
  const range = `${monthName(periods[0], "short", true)} – ${monthName(end, "short", true)}`;
  const bars = periods.map((period) => {
    const pt = points?.find((p) => p.period === period && p.currency === currency);
    const paid = pt ? parseFloat(pt.paid) : 0;
    const unpaid = pt ? parseFloat(pt.unpaid) : 0;
    return { period, paid, unpaid, total: paid + unpaid };
  });
  const filled = bars.filter((b) => b.total > 0);
  const avg = filled.length ? filled.reduce((s, b) => s + b.total, 0) / filled.length : 0;
  const max = niceMax(Math.max(...bars.map((b) => b.total), avg));
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const step = (W - LEFT * 2) / bars.length;

  // Runs of consecutive bars in the same calendar year, for the year labels and separators
  const years = bars.reduce<{ year: string; from: number; count: number }[]>((acc, b, i) => {
    const year = b.period.slice(0, 4);
    const last = acc[acc.length - 1];
    if (last?.year === year) last.count++;
    else acc.push({ year, from: i, count: 1 });
    return acc;
  }, []);

  // Without a hover, the bar of the dashboard's month is selected (the last one if it is off-window)
  const current = periods.includes(month) ? periods.indexOf(month) : bars.length - 1;
  const shown = bars[active ?? current];
  const diff = shown.total - avg;

  return (
    <section className={CARD_CLASS} aria-labelledby="trend-title" {...swipe}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trend-title" className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("title")}
        </h2>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t("paid")}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />{t("unpaid")}</span>
          {avg > 0 && <span>{t("average", { amount: money(avg) })}</span>}
        </span>
      </div>

      <div className="mb-3">
        <Stepper
          onPrev={() => moveTo(prevEnd)}
          onNext={() => moveTo(nextEnd)}
          prevDisabled={end <= prevEnd}
          nextDisabled={end >= nextEnd}
          prevLabel={tYear("previousYear")}
          nextLabel={tYear("nextYear")}
        >
          <StepperTitle title={range} />
        </Stepper>
      </div>

      {!points ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700/50" aria-busy="true" />
      ) : filled.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={t("chartLabel")}>
            <line x1={LEFT} x2={W - LEFT} y1={BASE} y2={BASE} className="stroke-slate-200 dark:stroke-slate-700" />
            {bars.map((b, i) => {
              const bw = step * 0.62;
              const x = LEFT + i * step + (step - bw) / 2;
              const isSel = i === (active ?? current);
              const dim = isSel ? 1 : 0.45;
              return (
                <g
                  key={b.period}
                  tabIndex={0}
                  role="button"
                  aria-label={`${monthName(b.period, "long")}: ${money(b.total)}`}
                  className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-green-500"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => { setActive(i); if (b.period >= minMonth && b.period <= maxMonth) onSelectMonth(b.period); }}
                >
                  <rect x={LEFT + i * step} y={TOP} width={step} height={BASE - TOP + 29} rx={6} strokeWidth={2}
                    className={`stroke-transparent ${isSel ? "fill-slate-100 dark:fill-slate-700/60" : "fill-transparent"}`} />
                  {b.paid > 0 && (
                    <rect x={x} y={y(b.paid)} width={bw} height={BASE - y(b.paid)} rx={2}
                      className="fill-emerald-500 dark:fill-emerald-600" opacity={dim} />
                  )}
                  {b.unpaid > 0 && (
                    <rect x={x} y={y(b.total)} width={bw} height={y(b.paid) - y(b.total)} rx={2}
                      className="fill-blue-400 dark:fill-blue-500" opacity={dim} />
                  )}
                  <text x={x + bw / 2} y={BASE + 22} textAnchor="middle"
                    className={`text-[20px] sm:text-[11px] ${isSel ? "fill-slate-800 font-bold dark:fill-slate-100" : "fill-slate-400 dark:fill-slate-500"}`}>
                    {monthName(b.period, "short")}
                  </text>
                </g>
              );
            })}
            {years.map((y, k) => (
              <g key={y.year} className="pointer-events-none">
                {k > 0 && (
                  <line x1={LEFT + y.from * step} x2={LEFT + y.from * step} y1={TOP} y2={BASE + 50} strokeDasharray="3 4"
                    className="stroke-slate-300 dark:stroke-slate-600" />
                )}
                <text x={LEFT + (y.from + y.count / 2) * step} y={BASE + 46} textAnchor="middle"
                  className="fill-slate-600 text-[22px] font-bold sm:text-[13px] dark:fill-slate-300">
                  {y.year}
                </text>
              </g>
            ))}
            {avg > 0 && (
              <line x1={LEFT} x2={W - LEFT} y1={y(avg)} y2={y(avg)} strokeDasharray="4 4"
                className="pointer-events-none stroke-slate-500 dark:stroke-slate-400" opacity={0.6} />
            )}
          </svg>

          <div className="mt-3 flex min-h-11 flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-700" aria-live="polite">
            <span className="font-medium text-slate-800 dark:text-slate-100">{monthName(shown.period, "long")}</span>
            <span className="tabular-nums text-slate-800 dark:text-slate-100">{money(shown.total)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("detail", { paid: money(shown.paid), unpaid: money(shown.unpaid) })}
            </span>
            {shown.total > 0 && avg > 0 && (
              <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {t(diff >= 0 ? "above" : "below", { amount: money(Math.abs(diff)) })}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
