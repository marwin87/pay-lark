"use client";

import {
  Pencil,
  Pause,
  Trash2,
  Play,
  Rocket,
  ChevronUp,
  NotebookPen,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import BillTemplateForm from "./BillTemplateForm";
import type { BillTemplateOut, BillTemplateUpdate } from "@/lib/bills-api";
import { categoryBorderClass } from "@/lib/categories";
import { useFrequencyLabel } from "@/lib/frequency";
import { formatAmount } from "@/lib/summary";

interface Props {
  template: BillTemplateOut;
  isExpanded: boolean;
  highlighted?: boolean;
  onEditToggle: () => void;
  onSave: (data: BillTemplateUpdate) => Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

export function formatDueLabel(template: BillTemplateOut, locale: string): string | null {
  const { frequency, due_day, due_days, due_month, start_period, dates } = template;
  const days = due_days ?? (due_day != null ? [due_day] : []);

  if (frequency === "one_off") {
    if (dates.length > 0) {
      const short = (iso: string) =>
        new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
          new Date(`${iso}T00:00:00Z`),
        );
      const shown = dates.slice(0, 3).map(short).join(", ");
      return dates.length > 3 ? `${shown} +${dates.length - 3}` : shown;
    }
    if (!start_period) return null;
    const [year, month] = start_period.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(year, month - 1)
    );
    if (due_day != null) return `${monthName} ${due_day}`;
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
      new Date(year, month - 1)
    );
  }

  if (frequency === "annual" && days.length > 0 && due_month != null) {
    const monthName = new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(2000, due_month - 1)
    );
    return `${monthName} ${days.join(", ")}`;
  }

  if (days.length > 0) return days.join(", ");
  return null;
}

export function formatLastPaymentLabel(endPeriod: string | null, locale: string): string | null {
  if (!endPeriod) return null;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(Number(endPeriod.slice(0, 4)), Number(endPeriod.slice(5, 7)) - 1, 1),
  );
}

export default function BillTemplateRow({
  template,
  isExpanded,
  highlighted = false,
  onEditToggle,
  onSave,
  onPause,
  onResume,
  onActivate,
  onDelete,
}: Props) {
  const t = useTranslations("BillTemplateRow");
  const tPage = useTranslations("BillsPage");
  const frequencyLabel = useFrequencyLabel();
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();

  const isDraft = !template.is_activated;
  const ribbon = template.is_archived
    ? { label: tPage("paused"), color: "bg-slate-500" }
    : isDraft
      ? { label: t("draft"), color: "bg-amber-500" }
      : null;

  const dueLabel = formatDueLabel(template, locale);

  const leftBorder = categoryBorderClass(template.category.color);
  const lastPaymentLabel = formatLastPaymentLabel(template.end_period, locale);

  return (
    <div
      id={`bill-${template.id}`}
      className={`bill-row group relative rounded-xl border ${
        isDraft ? "border-dashed border-slate-400 dark:border-slate-500" : "border-slate-200"
      } bg-white shadow-sm transition-shadow duration-500 dark:bg-slate-800 dark:border-slate-700 border-l-4 ${leftBorder} ${
        highlighted ? "bill-row-highlight ring-2 ring-green-200 dark:ring-green-800" : ""
      } ${template.is_archived ? "opacity-70" : ""}`}
    >
      {ribbon && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <span className={`absolute -left-9 top-5 w-32 -rotate-45 ${ribbon.color} py-0.5 text-center text-[11px] font-bold uppercase tracking-wide text-white shadow`}>
            {ribbon.label}
          </span>
        </div>
      )}
      {/* Collapsed row */}
      <div className={`flex flex-col gap-3 py-3 pr-4 sm:flex-row sm:items-center ${ribbon ? "pl-[58px]" : "pl-4"}`}>
        {/* Two-line content */}
        <div className="flex flex-1 flex-col min-w-0 gap-0.5">
          {/* Line 1: name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
              {template.name}
            </span>
          </div>

          {/* Line 2: amount · frequency · due */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {formatAmount(template.amount, decimalSeparator)} {template.currency}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {frequencyLabel(template.frequency, template.interval)}
            </span>
            {dueLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {t("dueOn")}&nbsp;{dueLabel}
              </span>
            )}
            {lastPaymentLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {t("lastPayment", { month: lastPaymentLabel })}
              </span>
            )}
          </div>

          {/* Notes */}
          {template.notes && (
            <div className="flex items-start gap-1 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              <NotebookPen size={10} className="mt-0.5 shrink-0" />
              <span className="line-clamp-1">{template.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sm:shrink-0">
          <div className="flex items-center justify-end gap-2 sm:gap-1">
            {isDraft && !template.is_archived && (
              <button
                onClick={onActivate}
                aria-label={t("generatePayments")}
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-transparent bg-emerald-600 px-3 sm:h-auto sm:flex-none sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 "
              >
                <Rocket className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" />
                <span className="truncate">{t("generatePayments")}</span>
              </button>
            )}
            {template.is_archived ? (
              <button
                onClick={onResume}
                aria-label={t("resume")}
                className="flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 sm:h-auto sm:flex-none sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
              >
                <Play className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" />
                <span className="truncate">{t("resume")}</span>
              </button>
            ) : isDraft ? (
              <button
                onClick={onDelete}
                aria-label={t("delete")}
                className="flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 sm:h-auto sm:flex-none sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-400 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                <Trash2 className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" />
                <span className="truncate">{t("delete")}</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                aria-label={t("pause")}
                className="flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 sm:h-auto sm:flex-none sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-400 shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-amber-800 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
              >
                <Pause className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" />
                <span className="truncate">{t("pause")}</span>
              </button>
            )}
            <button
              onClick={onEditToggle}
              aria-label={isExpanded ? t("close") : t("edit")}
              className="flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 sm:h-auto sm:flex-none sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            >
              {isExpanded ? <ChevronUp className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" /> : <Pencil className="shrink-0 h-5 w-5 sm:h-[15px] sm:w-[15px]" />}
              <span className="truncate">{isExpanded ? t("close") : t("edit")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="rounded-b-xl border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-5">
          <BillTemplateForm
            startPeriod={template.start_period}
            isDraft={isDraft}
            paidDates={template.paid_dates}
            initial={{
              name: template.name,
              category_id: template.category.id,
              frequency: template.frequency,
              interval: template.interval,
              amount: template.amount,
              currency: template.currency,
              due_day: template.due_day,
              due_days: template.due_days,
              dates: template.dates,
              due_month: template.due_month,
              end_period: template.end_period,
              notes: template.notes,
            }}
            onSave={onSave}
            onCancel={onEditToggle}
          />
        </div>
      )}
    </div>
  );
}
