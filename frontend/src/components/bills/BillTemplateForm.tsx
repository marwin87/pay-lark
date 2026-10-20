"use client";

import { FormEvent, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { todayIn } from "@/lib/today";
import CategoryCombobox from "./CategoryCombobox";
import MonthYearPicker from "./MonthYearPicker";
import CurrencyPicker from "@/components/CurrencyPicker";
import DaysOfMonthPicker from "@/components/ui/DaysOfMonthPicker";
import MultiDatePicker from "@/components/ui/MultiDatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { LOCALE_DEFAULT_CURRENCY } from "@/lib/currency";
import { formatAmount, isValidAmount } from "@/lib/summary";
import type { BillFrequency, BillTemplateCreate } from "@/lib/bills-api";
import { btnSaveClass, btnCancelClass } from "@/components/ui/formButtonClasses";

const FREQUENCY_VALUES: BillFrequency[] = ["monthly", "annual", "one_off"];

const RECURRING_FREQUENCIES: BillFrequency[] = ["monthly"];

interface Props {
  initial?: Partial<BillTemplateCreate>;
  startPeriod?: string | null; // saved start (YYYY-MM) when editing
  isDraft?: boolean; // not activated yet: the start month is still editable
  paidDates?: string[]; // one-off dates already paid: they stay (history)
  defaultCurrency?: string | null;
  onSave: (data: BillTemplateCreate) => Promise<void>;
  onCancel: () => void;
}

// Last scheduled payment on or before `end`, for a cycle of `step` months starting at `start`.
function lastPayment(start: string, end: string, step: number) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const diff = (ey - sy) * 12 + (em - sm);
  if (diff < 0) return null;
  const total = sy * 12 + (sm - 1) + Math.floor(diff / step) * step;
  return { year: Math.floor(total / 12), month: (total % 12) + 1, aligned: diff % step === 0 };
}

interface Errors {
  name?: string;
  amount?: string;
  days?: string;
  category?: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5";

export default function BillTemplateForm({ initial, startPeriod, isDraft, paidDates, defaultCurrency, onSave, onCancel }: Props) {
  const t = useTranslations("BillTemplateForm");
  const tFreq = useTranslations("Frequencies");
  const locale = useLocale();
  const { decimalSeparator, timeZone } = useAppLocale();
  // "Today" in the profile's zone, the same calendar the backend uses
  const todayStr = todayIn(timeZone);
  const todayYear = Number(todayStr.slice(0, 4));
  const todayMonth = Number(todayStr.slice(5, 7));
  const todayDay = Number(todayStr.slice(8, 10));
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initial?.category_id ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    initial?.frequency ?? "monthly",
  );
  const [interval, setIntervalValue] = useState(initial?.interval ?? 1);
  const [amount, setAmount] = useState(
    initial?.amount ? formatAmount(initial.amount, decimalSeparator) : "",
  );
  const initialCurrency =
    initial?.currency ?? defaultCurrency ?? LOCALE_DEFAULT_CURRENCY[locale] ?? "EUR";
  const [currency, setCurrency] = useState(initialCurrency);
  // Payment days of one cycle (monthly/annual) and explicit dates (one-off)
  const [dueDays, setDueDays] = useState<number[]>(
    initial?.due_days ?? (initial?.due_day != null ? [initial.due_day] : [todayDay]),
  );
  const [dates, setDates] = useState<string[]>(initial?.dates?.length ? initial.dates : [todayStr]);
  const [dueMonth, setDueMonth] = useState(
    initial?.due_month != null ? String(initial.due_month) : String(todayMonth),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [endPeriod, setEndPeriod] = useState(initial?.end_period ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const isRecurring = RECURRING_FREQUENCIES.includes(frequency);

  // Recurring bills anchor to the current year + chosen month on create (mirrors the backend).
  const currentPeriod = todayStr.slice(0, 7);
  const effectiveStart =
    (isDraft ? null : startPeriod) ?? `${todayYear}-${String(parseInt(dueMonth, 10) || todayMonth).padStart(2, "0")}`;
  const minEnd = effectiveStart > currentPeriod ? effectiveStart : currentPeriod;
  // The server keeps an existing monthly bill's start (it anchors the cycle and its history)
  const startLocked = !!startPeriod && frequency === "monthly" && !isDraft;
  const startMonth = startLocked ? Number(startPeriod.slice(5, 7)) : parseInt(dueMonth, 10) || todayMonth;
  const maxInterval = frequency === "annual" ? 5 : 12;
  const effectiveInterval = frequency === "one_off" ? 1 : Math.min(interval, maxInterval);
  const step = effectiveInterval * (frequency === "annual" ? 12 : 1);
  const endHint = endPeriod ? lastPayment(effectiveStart, endPeriod, step) : null;

  function validate(fields: {
    name: string;
    amount: string;
    categoryId: number | "";
    days?: boolean;
  }): Errors {
    const e: Errors = {};
    if (!fields.name.trim()) e.name = t("nameRequired");
    if (fields.amount.trim() && !isValidAmount(fields.amount))
      e.amount = t("amountInvalid");
    if (!fields.categoryId) e.category = t("categoryRequired");
    if (fields.days === false) e.days = t(frequency === "one_off" ? "datesRequired" : "daysRequired");
    return e;
  }

  function revalidate(overrides: Partial<{ name: string; amount: string; categoryId: number | "" }>) {
    if (submitAttempted) {
      setErrors(validate({ name, amount, categoryId, ...overrides }));
    }
  }

  function handleNameChange(v: string) { setName(v); revalidate({ name: v }); }
  function handleAmountChange(v: string) { setAmount(v); revalidate({ amount: v }); }
  function handleCategoryChange(v: number | "") { setCategoryId(v); revalidate({ categoryId: v }); }
  function handleFrequencyChange(v: BillFrequency) { setFrequency(v); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const errs = validate({ name, amount, categoryId, days: (frequency === "one_off" ? dates : dueDays).length > 0 });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setApiError(null);
    try {
      const payload: BillTemplateCreate = {
        name: name.trim(),
        category_id: categoryId as number,
        frequency,
        interval: effectiveInterval,
        amount: amount.trim().replace(",", ".") || "0",
        currency: currency || "EUR",
        ...(frequency === "one_off"
          ? { dates, due_day: null, due_days: null, due_month: null }
          : { due_days: dueDays, due_day: dueDays[0], due_month: startMonth }),
        end_period: isRecurring ? endPeriod || null : null,
        notes: notes.trim() || null,
      };
      await onSave(payload);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {apiError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {apiError}
        </div>
      )}

      {/* Row 1: Name + Amount */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bill-name" className={labelClass}>
            {t("nameLabel")} <span className="text-red-400">*</span>
          </label>
          <input
            id="bill-name"
            maxLength={255}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="bill-amount" className={labelClass}>{t("amountLabel")}</label>
          <input
            id="bill-amount"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={formatAmount(0, decimalSeparator)}
            inputMode="decimal"
            className={inputClass}
          />
          {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
          <div className="mt-2">
            <CurrencyPicker
              value={currency}
              onChange={setCurrency}
              ariaLabel={t("currencyAriaLabel")}
              customOption={t("customOption")}
              customCurrencyAriaLabel={t("customCurrencyAriaLabel")}
              customCurrencyPlaceholder={t("customCurrencyPlaceholder")}
              inputClassName={inputClass + " mt-2"}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Frequency pills */}
      <div>
        <label className={labelClass}>
          {t("frequencyLabel")} <span className="text-red-400">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {FREQUENCY_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleFrequencyChange(v)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                frequency === v
                  ? "border-green-600 bg-green-50 text-green-700 shadow-sm dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
              }`}
            >
              {tFreq(v)}
            </button>
          ))}
        </div>
        {frequency !== "one_off" && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="bill-interval" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("intervalLabel")}
            </label>
            <Dropdown
              id="bill-interval"
              variant="pill"
              scrollable
              value={String(effectiveInterval)}
              onChange={(v) => setIntervalValue(Number(v))}
              options={Array.from({ length: maxInterval }, (_, i) => ({
                value: String(i + 1),
                label: tFreq(frequency === "annual" ? "years" : "months", { count: i + 1 }),
              }))}
            />
          </div>
        )}
      </div>

      {/* Row 3: when it is paid + optional end month (fixed-term bills) */}
      <div className={isRecurring ? "grid gap-4 sm:grid-cols-2" : ""}>
        <div className="flex flex-col gap-4">
          {frequency === "one_off" ? (
            <div>
              <label className={labelClass}>{t("datesLabel")}</label>
              <MultiDatePicker value={dates} onChange={setDates} lockedDates={paidDates} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="bill-start-month" className={labelClass}>
                  {isRecurring ? t("startMonthLabel") : t("annualMonthLabel")}
                </label>
                <MonthYearPicker
                  id="bill-start-month"
                  value={`${effectiveStart.slice(0, 4)}-${String(startMonth).padStart(2, "0")}`}
                  clearable={false}
                  disabled={startLocked}
                  onChange={(ym) => ym && setDueMonth(String(Number(ym.slice(5, 7))))}
                />
                {startLocked && (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t("startLocked")}</p>
                )}
              </div>
              <div>
                <label htmlFor="bill-days" className={labelClass}>{t("daysLabel")}</label>
                <DaysOfMonthPicker
                  id="bill-days"
                  value={dueDays}
                  year={Number(effectiveStart.slice(0, 4))}
                  month={startMonth}
                  stepMonths={step}
                  onChange={setDueDays}
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("daysHint")}</p>
              </div>
            </>
          )}
          {errors.days && <p className="text-xs text-red-500">{errors.days}</p>}
        </div>
        {isRecurring && (
          <div>
            <label htmlFor="bill-end-period" className={labelClass}>{t("endPeriodLabel")}</label>
            <MonthYearPicker id="bill-end-period" value={endPeriod} min={minEnd} onChange={setEndPeriod} />
            {/* Only warn when the cycle skips the chosen month; an aligned pick needs no echo */}
            {endHint && !endHint.aligned && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                {t("endPeriodAdjusted", {
                  month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
                    new Date(endHint.year, endHint.month - 1, 1),
                  ),
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Row 4: Category + Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bill-category" className={labelClass}>
            {t("categoryLabel")} <span className="text-red-400">*</span>
          </label>
          <CategoryCombobox
            id="bill-category"
            value={categoryId}
            onChange={handleCategoryChange}
          />
          {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
        </div>
        <div>
          <label htmlFor="bill-notes" className={labelClass}>{t("notesLabel")}</label>
          <textarea
            id="bill-notes"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("notesPlaceholder")}
            className={inputClass + " resize-none"}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className={btnCancelClass}
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className={btnSaveClass}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
