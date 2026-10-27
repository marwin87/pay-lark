"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle, AtSign, CheckCircle, MessageSquare, Pencil, Undo2, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { todayIn } from "@/lib/today";
import type { PaymentInstanceOut } from "@/lib/payments-api";
import { formatAmount } from "@/lib/summary";

interface Props {
  instance: PaymentInstanceOut;
  onMarkPaid: (instance: PaymentInstanceOut) => void;
  onDelete: (instance: PaymentInstanceOut) => void;
  onRevert: (instance: PaymentInstanceOut) => void;
  onEdit: (instance: PaymentInstanceOut) => void;
  /** True for past months — hides the Mark as Paid button. */
  readOnly?: boolean;
  /** Shown as a small label next to the name when the list isn't grouped by category. */
  categoryName?: string;
}

export default function PaymentRow({ instance, onMarkPaid, onDelete, onRevert, onEdit, readOnly = false, categoryName }: Props) {
  const t = useTranslations("PaymentRow");
  const locale = useLocale();
  const { decimalSeparator, timeZone } = useAppLocale();
  const [emailOpen, setEmailOpen] = useState(false);
  const emailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emailOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (emailRef.current && !emailRef.current.contains(e.target as Node)) {
        setEmailOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emailOpen]);

  // Append T00:00:00 so JS treats due_date as local time, not UTC midnight
  const dueDate = new Date(instance.due_date + "T00:00:00");
  function formatDate(date: Date): string {
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    return fmt.formatToParts(date).map(({ type, value }) =>
      type === "month" ? value.charAt(0).toUpperCase() + value.slice(1) : value
    ).join("");
  }

  const dueDateFormatted = formatDate(dueDate);

  // "Today" in the profile's zone, the same calendar the backend uses for overdue
  const today = todayIn(timeZone);
  const isDueToday = instance.due_date === today;
  const daysUntil = Math.round((Date.parse(instance.due_date) - Date.parse(today)) / 86_400_000);

  // Status ribbon only for what needs action; upcoming gets a quieter marker instead.
  const statusRibbon =
    instance.status === "overdue"
      ? { label: t("status.overdue"), color: "bg-red-600" }
      : isDueToday && instance.status === "upcoming"
        ? { label: t("dueToday"), color: "bg-orange-500" }
        : null;
  const isCalmUpcoming = instance.status === "upcoming" && !statusRibbon;
  const ribbonCount = (statusRibbon ? 1 : 0) + (instance.is_last ? 1 : 0);

  function tileGradientClass(): string {
    const base = "bg-gradient-to-r from-0% to-70%";
    if (instance.status === "overdue") return `${base} from-red-100 to-white dark:from-red-500/10 dark:to-slate-800`;
    if (instance.status === "paid") return `${base} from-emerald-100 to-white dark:from-emerald-500/10 dark:to-slate-800`;
    if (isDueToday) return `${base} from-orange-100 to-white dark:from-orange-400/10 dark:to-slate-800`;
    return `${base} from-blue-100 to-white dark:from-blue-400/10 dark:to-slate-800`;
  }

  const paidAt = instance.paid_at ? new Date(instance.paid_at) : null;
  const paidAtFormatted = paidAt ? formatDate(paidAt) : null;

  const amountMismatch =
    instance.status === "paid" &&
    instance.paid_amount != null &&
    parseFloat(instance.amount) > 0 &&
    parseFloat(instance.paid_amount) !== parseFloat(instance.amount);

  const emailSentAt = instance.email_sent_at ? new Date(instance.email_sent_at) : null;
  const emailSentAtFormatted = emailSentAt
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(emailSentAt)
    : null;

  return (
    <div className={`relative max-sm:pb-[76px] rounded-xl border border-slate-200 px-4 py-3 shadow-sm dark:border-slate-700 transition-colors ${isCalmUpcoming ? "border-l-4 border-l-sky-500" : ""} ${tileGradientClass()}`}>
      {ribbonCount > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          {statusRibbon && (
            <span className={`ribbon absolute -left-9 top-5 w-32 -rotate-45 ${statusRibbon.color} py-0.5 text-center text-[11px] font-bold uppercase tracking-wide text-white shadow`}>
              {statusRibbon.label}
            </span>
          )}
          {instance.is_last && (
            <span
              aria-hidden="true"
              className={`ribbon absolute -rotate-45 bg-violet-600 py-0.5 text-center font-bold uppercase tracking-wide text-white shadow ${
                statusRibbon ? "-left-[1.6rem] top-[1.9rem] w-36 text-[10px]" : "-left-9 top-5 w-32 text-[11px]"
              }`}
            >
              {t("lastRibbon")}
            </span>
          )}
        </div>
      )}
      <div className={`flex flex-col gap-0.5 ${ribbonCount === 2 ? "pl-[66px]" : ribbonCount === 1 ? "pl-[50px]" : ""}`}>
        {/* Name */}
        <div className="flex items-center gap-2 min-w-0">
          {instance.is_last && <span className="sr-only">{t("lastPayment")}</span>}
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
            {instance.bill_name}
          </span>
          {categoryName && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {categoryName}
            </span>
          )}
          {isCalmUpcoming && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              {t("inDays", { count: daysUntil })}
            </span>
          )}
        </div>
        {/* Amount */}
        {parseFloat(instance.amount) > 0 && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {formatAmount(instance.amount, decimalSeparator)} {instance.currency}
          </span>
        )}
        {/* Due date + status (left) — actions (right) */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-slate-400 dark:text-slate-500 shrink-0">
              {t("due")} {dueDateFormatted}
            </span>
            {instance.status === "paid" && paidAtFormatted && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-emerald-600 dark:text-emerald-400 truncate">
                  {t("paidOn")} {paidAtFormatted}
                  {instance.paid_amount != null && parseFloat(instance.paid_amount) > 0 && (
                    <> · {formatAmount(instance.paid_amount, decimalSeparator)} {instance.currency}</>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1 max-sm:absolute max-sm:bottom-3 max-sm:right-3 max-sm:gap-1.5 max-sm:pt-3 max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:top-0 max-sm:before:h-px max-sm:before:bg-gradient-to-r max-sm:before:from-transparent max-sm:before:to-slate-300 dark:max-sm:before:to-slate-600">
            {/* Primary action */}
            {!readOnly && instance.status !== "paid" && (
              <button
                onClick={() => onMarkPaid(instance)}
                className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
              >
                <CheckCircle className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{t("markAsPaid")}</span>
              </button>
            )}
            {/* Edit — any status (unpaid: due date + amount + note; paid: date, amount, note) */}
            <button
              onClick={() => onEdit(instance)}
              title={t("edit")}
              aria-label={t("edit")}
              className="flex h-11 w-11 items-center justify-center rounded-xl sm:h-auto sm:w-auto sm:rounded-lg sm:p-1.5 max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm dark:max-sm:border-slate-600 dark:max-sm:bg-slate-800 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <Pencil className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
            </button>
            {/* Revert — visible for paid instances */}
            {instance.status === "paid" && (
              <button
                onClick={() => onRevert(instance)}
                title={t("revert")}
                aria-label={t("revert")}
                className="flex h-11 w-11 items-center justify-center rounded-xl sm:h-auto sm:w-auto sm:rounded-lg sm:p-1.5 max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm dark:max-sm:border-slate-600 dark:max-sm:bg-slate-800 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <Undo2 className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
              </button>
            )}
            <div className="mx-0.5 hidden h-4 w-px bg-slate-200 dark:bg-slate-600 sm:block" />
            {/* Email notification indicator */}
            <div className="relative" ref={emailRef}>
              <button
                aria-label={t("emailNotification")}
                aria-expanded={emailOpen}
                onClick={() => setEmailOpen((o) => !o)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl sm:h-auto sm:w-auto sm:rounded-lg sm:p-1.5 max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm dark:max-sm:border-slate-600 dark:max-sm:bg-slate-800 transition-colors ${
                  emailSentAt
                    ? "text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : "text-slate-300 hover:bg-slate-100 hover:text-slate-400 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-500"
                }`}
              >
                <AtSign className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
              </button>
              {emailOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-slate-700 z-10 whitespace-normal">
                  {emailSentAtFormatted
                    ? `${t("emailSentOn")} ${emailSentAtFormatted}`
                    : t("emailNotSent")}
                  <div className="absolute top-full right-3 -mt-px border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
                </div>
              )}
            </div>
            <div className="mx-0.5 hidden h-4 w-px bg-slate-200 dark:bg-slate-600 sm:block" />
            <button
              onClick={() => onDelete(instance)}
              aria-label={t("delete")}
              className="flex h-11 w-11 items-center justify-center rounded-xl sm:h-auto sm:w-auto sm:rounded-lg sm:p-1.5 max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm dark:max-sm:border-slate-600 dark:max-sm:bg-slate-800 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
            </button>
          </div>
        </div>
        {/* Amount mismatch warning */}
        {amountMismatch && (
          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
            <AlertCircle size={12} className="shrink-0 text-amber-500 dark:text-amber-400" />
            <span>
              {t.rich("amountMismatch", {
                expected: `${formatAmount(instance.amount, decimalSeparator)} ${instance.currency}`,
                paid: `${formatAmount(instance.paid_amount ?? "0", decimalSeparator)} ${instance.currency}`,
                expTag: (chunks) => <strong className="font-semibold text-slate-800 dark:text-slate-100">{chunks}</strong>,
                paidTag: (chunks) => <strong className="font-semibold text-amber-600 dark:text-amber-400">{chunks}</strong>,
              })}
            </span>
          </div>
        )}
        {/* Note — shown below when present */}
        {instance.notes && (
          <>
            <div className="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <MessageSquare size={12} className="shrink-0 mt-0.5" />
              <span>{instance.notes}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
