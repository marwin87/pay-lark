"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "@/context/locale-context";
import { ApiError } from "@/lib/api";
import { markPaid, updatePayment, type PaymentInstanceOut } from "@/lib/payments-api";
import { formatAmount, isValidAmount } from "@/lib/summary";
import { todayIn } from "@/lib/today";
import DatePicker from "@/components/ui/DatePicker";
import DialogHeader from "@/components/ui/DialogHeader";
import PaymentSubject from "./PaymentSubject";
import DialogShell from "@/components/ui/DialogShell";

interface Props {
  instance: PaymentInstanceOut;
  isOpen: boolean;
  /** "pay" marks it paid; "edit" changes a payment (paid or not) in place. */
  mode?: "pay" | "edit";
  onClose: () => void;
  onConfirm: (updated: PaymentInstanceOut) => void;
}

export default function MarkPaidDialog({
  instance,
  isOpen,
  mode = "pay",
  onClose,
  onConfirm,
}: Props) {
  const t = useTranslations("MarkPaidDialog");
  const { decimalSeparator, timeZone } = useLocale();

  const isEdit = mode === "edit";
  const isPaid = instance.status === "paid";
  // Editing an unpaid payment: no date, and an empty amount means "use the
  // bill's amount" (the placeholder shows it).
  const editingUnpaid = isEdit && !isPaid;

  const [paidAmount, setPaidAmount] = useState(() => {
    const raw =
      (isEdit
        ? isPaid
          ? instance.paid_amount
          : instance.amount_overridden
            ? instance.amount
            : ""
        : instance.amount) ?? "";
    return raw ? formatAmount(raw, decimalSeparator) : "";
  });
  const [paidDate, setPaidDate] = useState(
    isEdit && instance.paid_at
      ? todayIn(timeZone, new Date(instance.paid_at))
      : todayIn(timeZone),
  );
  const [dueDate, setDueDate] = useState(instance.due_date);
  const [notes, setNotes] = useState(instance.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid =
    paidAmount === "" || isValidAmount(paidAmount);
  const mounted = useRef(true);
  // Re-arm on mount: React strict mode (dev) runs mount, cleanup, mount, and a
  // cleanup-only effect would leave the ref false, so results would be dropped.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const normalized = paidAmount === "" ? null : paidAmount.replace(",", ".");
      const amount = normalized === null ? null : parseFloat(normalized);
      const updated = !isEdit
        ? await markPaid(instance.id, normalized, notes, paidDate)
        : editingUnpaid
          ? await updatePayment(instance.id, { amount, notes, due_date: dueDate })
          : await updatePayment(instance.id, {
              paid_amount: amount,
              notes,
              paid_at: paidDate,
            });
      onConfirm(updated);
    } catch (err) {
      if (!mounted.current) return;
      // Another tab/device changed this payment since the list was loaded.
      setError(
        err instanceof ApiError && err.status === 404
          ? t("paymentGone")
          : err instanceof ApiError && err.status === 400 && !isEdit
            ? t("alreadyPaid")
            : err instanceof Error
              ? err.message
              : t("saveFailed"),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <DialogShell labelledBy="mark-paid-dialog-title" onClose={onClose} busy={isSubmitting}>
        <DialogHeader
          id="mark-paid-dialog-title"
          badgeClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          icon={<CheckCircle size={18} />}
          title={t(isEdit ? "editTitle" : "title")}
          subtitle={<PaymentSubject instance={instance} />}
          onClose={onClose}
          busy={isSubmitting}
        />

        {!editingUnpaid && (
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("dateLabel")}
              <span className="text-red-500"> *</span>
            </label>
            <DatePicker value={paidDate} onChange={setPaidDate} max={todayIn(timeZone)} />
          </div>
        )}

        {editingUnpaid && (
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("dueDateLabel")}
              <span className="text-red-500"> *</span>
            </label>
            <DatePicker value={dueDate} onChange={setDueDate} min={`${instance.period}-01`} max={`${instance.period}-31`} />
          </div>
        )}

        <div className="mb-3">
          <label
            htmlFor="paid-amount"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t(editingUnpaid ? "dueAmountLabel" : "amountLabel")}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100 dark:border-slate-600 dark:bg-slate-900/40 dark:focus-within:border-green-600">
            <input
              id="paid-amount"
              inputMode="decimal"
              value={paidAmount}
              placeholder={editingUnpaid ? formatAmount(instance.amount, decimalSeparator) : undefined}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100"
            />
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {instance.currency}
            </span>
          </div>
          {!amountValid && (
            <p className="mt-1.5 text-xs text-red-500">{t("amountInvalid")}</p>
          )}
          {editingUnpaid && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {t("amountHint")}
            </p>
          )}
        </div>

        <div className="mb-5">
          <label
            htmlFor="paid-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t("notesLabel")}
          </label>
          <textarea
            id="paid-notes"
            maxLength={2000}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:focus:border-green-600"
          />
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !amountValid}
            className="flex-1 rounded-lg border border-transparent bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? t("confirming") : t(isEdit ? "save" : "confirm")}
          </button>
        </div>
      </DialogShell>
  );
}
