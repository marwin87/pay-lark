import { useLocale as useAppLocale } from "@/context/locale-context";
import type { PaymentInstanceOut } from "./payments-api";
import { todayIn } from "./today";

/** Status colors of the subject block in payment popups. */
const TONES = {
  overdue: {
    subject: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20",
  },
  today: {
    subject: "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-900/20",
  },
  upcoming: {
    subject: "border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-900/20",
  },
  paid: {
    subject: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20",
  },
};

/** Same split as the payment tile: overdue / due today / upcoming / paid. */
export function usePaymentTone(instance: PaymentInstanceOut) {
  const { timeZone } = useAppLocale();
  if (instance.status === "overdue") return TONES.overdue;
  if (instance.status === "paid") return TONES.paid;
  return instance.due_date === todayIn(timeZone) ? TONES.today : TONES.upcoming;
}
