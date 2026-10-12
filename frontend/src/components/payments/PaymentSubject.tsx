"use client";

import { useLocale, useTranslations } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { categoryLabel, categorySwatchClass } from "@/lib/categories";
import { useFrequencyLabel } from "@/lib/frequency";
import type { PaymentInstanceOut } from "@/lib/payments-api";
import { formatAmount } from "@/lib/summary";
import DialogSubject from "@/components/ui/DialogSubject";

/** The payment a popup acts on: category dot, name, category · frequency, amount and due date. */
export default function PaymentSubject({ instance }: { instance: PaymentInstanceOut }) {
  const tCat = useTranslations("Categories");
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();
  const frequencyLabel = useFrequencyLabel();
  const amount = instance.status === "paid" && instance.paid_amount ? instance.paid_amount : instance.amount;
  const due = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(instance.due_date + "T00:00:00Z"),
  );
  return (
    <DialogSubject
      name={instance.bill_name}
      dotClass={categorySwatchClass(instance.category.color)}
      meta={`${categoryLabel(instance.category, tCat)} · ${frequencyLabel(instance.frequency, instance.interval)}`}
      right={
        <>
          <span className="font-semibold">
            {formatAmount(amount, decimalSeparator)} {instance.currency}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{due}</span>
        </>
      }
    />
  );
}
