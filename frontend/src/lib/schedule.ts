import type { BillFrequency } from "./bills-api";

interface ScheduleInput {
  frequency: BillFrequency;
  stepMonths: number; // months between cycles (12 for annual)
  start: string; // YYYY-MM of the first cycle
  days: number[]; // payment days of one cycle
  dates: string[]; // YYYY-MM-DD, one-off bills only
  end: string | null; // YYYY-MM of the last cycle
  today: string; // YYYY-MM-DD
  count?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The next payments (YYYY-MM-DD, today included) a bill with this schedule will get. */
export function upcomingPayments({ frequency, stepMonths, start, days, dates, end, today, count = 3 }: ScheduleInput): string[] {
  if (frequency === "one_off") {
    return [...dates].filter((d) => d >= today).sort().slice(0, count);
  }
  const sorted = [...days].sort((a, b) => a - b);
  const out: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  for (let k = 0; sorted.length > 0 && out.length < count && k < 600; k++) {
    const total = sy * 12 + (sm - 1) + k * stepMonths;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    if (end && `${year}-${pad(month)}` > end) break;
    const lastDay = new Date(year, month, 0).getDate(); // days 29-31 fall on the month's last day
    for (const d of sorted) {
      const date = `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
      if (date >= today && out.length < count) out.push(date);
    }
  }
  return out;
}
