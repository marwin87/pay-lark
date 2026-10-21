import type { Category } from "./categories-api";
import type { PaymentInstanceOut, TrendPoint } from "./payments-api";

export interface CategoryTotal {
  category: Category;
  total: number;
  paid: number;
}

export interface MonthSummary {
  paid: number;
  overdue: number;
  upcoming: number;
  paidCount: number;
  overdueCount: number;
  upcomingCount: number;
  byCategory: CategoryTotal[]; // largest first
}

/** What was actually paid, else the expected amount. */
function paidValue(p: PaymentInstanceOut): number {
  return parseFloat(p.paid_amount ?? p.amount);
}

/** Totals for one currency — amounts in different currencies are never added. */
export function summarize(instances: PaymentInstanceOut[], currency: string): MonthSummary {
  const s: MonthSummary = {
    paid: 0, overdue: 0, upcoming: 0, paidCount: 0, overdueCount: 0, upcomingCount: 0, byCategory: [],
  };
  const cats = new Map<number, CategoryTotal>();
  for (const p of instances) {
    if (p.currency !== currency) continue;
    const value = p.status === "paid" ? paidValue(p) : parseFloat(p.amount);
    if (p.status === "paid") { s.paid += value; s.paidCount++; }
    else if (p.status === "overdue") { s.overdue += value; s.overdueCount++; }
    else { s.upcoming += value; s.upcomingCount++; }
    const row = cats.get(p.category.id) ?? { category: p.category, total: 0, paid: 0 };
    row.total += value;
    if (p.status === "paid") row.paid += value;
    cats.set(p.category.id, row);
  }
  s.byCategory = [...cats.values()].sort((a, b) => b.total - a.total);
  return s;
}

/** Currencies present in the data, most money first. */
export function currenciesByVolume(
  instances: PaymentInstanceOut[],
  trend: TrendPoint[],
): string[] {
  const vol = new Map<string, number>();
  for (const p of instances) vol.set(p.currency, (vol.get(p.currency) ?? 0) + parseFloat(p.amount));
  for (const t of trend) {
    vol.set(t.currency, (vol.get(t.currency) ?? 0) + parseFloat(t.paid) + parseFloat(t.unpaid));
  }
  return [...vol.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** Formats a raw two-decimal amount string/number with the user's chosen decimal separator. */
export function formatAmount(raw: string | number, separator: "." | ","): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return n.toFixed(2).replace(".", separator);
}

/** Currency-formats the exact value (2 decimals, never rounded to a whole unit —
 * dashboard totals must reflect the real amount) with the user's chosen decimal
 * separator. Grouping is off, matching formatAmount elsewhere: with only one
 * separator character on screen, there's no ambiguity about which one it is. */
export function formatMoney(
  value: number,
  currency: string,
  locale: string,
  decimalSeparator: "." | ",",
): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    }).formatToParts(value);
    return parts.map((p) => (p.type === "decimal" ? decimalSeparator : p.value)).join("");
  } catch {
    return `${formatAmount(value, decimalSeparator)} ${currency}`; // custom code Intl doesn't know
  }
}

/** `month` ("YYYY-MM") moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + m - 1 + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** The 12 "YYYY-MM" periods ending at `month`, oldest first (mirrors the backend). */
export function trendPeriods(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const end = y * 12 + m - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const idx = end - 11 + i;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

/** True for a typed amount that is a non-negative number with at most 2 decimal places. */
export function isValidAmount(raw: string): boolean {
  const s = raw.trim().replace(",", ".");
  return !isNaN(Number(s)) && Number(s) >= 0 && (s.split(".")[1] ?? "").length <= 2;
}
