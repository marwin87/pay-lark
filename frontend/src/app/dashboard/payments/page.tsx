"use client";

import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { getCached, setCached } from "@/lib/page-cache";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, ChevronsUpDown, FileSpreadsheet, FileText, Loader2, Share2, X } from "lucide-react";
import { Fragment } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { browseYears, todayIn } from "@/lib/today";
import { setOverdueBadge } from "@/lib/app-badge";
import {
  fetchPayments,
  syncInstances,
  type PaymentInstanceOut,
} from "@/lib/payments-api";
import {
  categoryFilterLabel,
  distinctCategories,
  sortCategoriesByLabel,
  type CategorySortOrder,
} from "@/lib/categories";
import Dropdown from "@/components/ui/Dropdown";
import { downloadPdf, downloadXlsx } from "@/lib/export-api";
import { fetchMe } from "@/lib/user-api";
import { SessionExpiredError, apiFetch } from "@/lib/api";
import PaymentRow from "@/components/payments/PaymentRow";
import PaymentsCalendar from "@/components/payments/PaymentsCalendar";
import MarkPaidDialog from "@/components/payments/MarkPaidDialog";
import PageHeader from "@/components/PageHeader";
import Stepper, { StepperTitle, monthRelative } from "@/components/ui/Stepper";
import MonthSheet from "@/components/payments/MonthSheet";
import ShareMonthDialog from "@/components/payments/ShareMonthDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import RevertPaymentDialog from "@/components/payments/RevertPaymentDialog";
import FilterSelect from "@/components/FilterSelect";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import SearchInput from "@/components/SearchInput";
import FiltersHeader from "@/components/FiltersHeader";
import { useCollapsedCategories, COLLAPSED_CATEGORIES_KEYS } from "@/hooks/useCollapsedCategories";
import { useSortOption } from "@/hooks/useSortOption";
import { useSessionSet, useSessionString, VIEW_STATE_KEYS } from "@/hooks/useSessionState";
import { useSwipe } from "@/hooks/useSwipe";
import { toastName, useToast } from "@/context/toast-context";

type PaymentSortOption = "category-az" | "category-za" | "paid-first" | "unpaid-first";
const PAYMENT_SORT_OPTIONS: PaymentSortOption[] = [
  "category-az",
  "category-za",
  "paid-first",
  "unpaid-first",
];
import {
  PaymentActionProvider,
  usePaymentActions,
} from "@/context/payment-context";

type ExportScope = "month" | "year";

function getMonthLabel(year: number, monthIndex: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(year, monthIndex),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthName(year: number, monthIndex: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(year, monthIndex));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function CategorySummary({
  group,
  todayStr,
  labels,
}: {
  group: PaymentInstanceOut[];
  todayStr: string;
  labels: {
    upcoming: string;
    overdueToday: string;
    overdue: string;
    paid: string;
  };
}) {
  const upcomingCount = group.filter((i) => i.status === "upcoming").length;
  const overdueTodayCount = group.filter(
    (i) => i.status === "overdue" && i.due_date === todayStr,
  ).length;
  const overdueOlderCount = group.filter(
    (i) => i.status === "overdue" && i.due_date < todayStr,
  ).length;
  const paidCount = group.filter((i) => i.status === "paid").length;

  const segments: { key: string; text: string; className: string }[] = [];
  if (upcomingCount > 0)
    segments.push({ key: "upcoming", text: `${upcomingCount} ${labels.upcoming}`, className: "text-slate-500 dark:text-slate-400" });
  if (overdueTodayCount > 0)
    segments.push({ key: "overdueToday", text: `${overdueTodayCount} ${labels.overdueToday}`, className: "text-orange-500 dark:text-orange-400" });
  if (overdueOlderCount > 0)
    segments.push({ key: "overdueOlder", text: `${overdueOlderCount} ${labels.overdue}`, className: "text-red-500 dark:text-red-400" });
  if (paidCount > 0)
    segments.push({ key: "paid", text: `${paidCount} ${labels.paid}`, className: "text-emerald-600 dark:text-emerald-400" });

  return (
    <span className="flex items-center gap-1 text-xs font-medium">
      {segments.map((seg, i) => (
        <Fragment key={seg.key}>
          {i > 0 && <span className="text-slate-300 dark:text-slate-600">·</span>}
          <span className={seg.className}>{seg.text}</span>
        </Fragment>
      ))}
    </span>
  );
}

export default function PaymentsPage() {
  return (
    <PaymentActionProvider>
      <PaymentsPageInner />
    </PaymentActionProvider>
  );
}

function PaymentsPageInner() {
  const t = useTranslations("PaymentsPage");
  const tRow = useTranslations("PaymentRow");
  const tNav = useTranslations("Dashboard.nav");
  const tCategories = useTranslations("Categories");
  const tFilters = useTranslations("Filters");
  const showToast = useToast();
  const locale = useLocale();

  // "Today" in the profile's zone, the same calendar the backend uses
  const { timeZone } = useAppLocale();
  const todayStr = todayIn(timeZone);
  const currentYear = Number(todayStr.slice(0, 4));
  const { minYear, maxYear } = browseYears(currentYear);
  const currentMonth = todayStr.slice(0, 7);

  const [selectedMonth, setSelectedMonthRaw] = useState<string>(currentMonth);
  const {
    dialogTarget,
    setDialogTarget,
    deleteTarget,
    setDeleteTarget,
    revertTarget,
    setRevertTarget,
  } = usePaymentActions();
  const [editTarget, setEditTarget] = useState<PaymentInstanceOut | null>(null);
  const [instances, setInstances] = useState<PaymentInstanceOut[]>(
    () => getCached<PaymentInstanceOut[]>(`payments:${currentMonth}`) ?? [],
  );
  const [loadedMonth, setLoadedMonth] = useState<string | null>(() =>
    getCached(`payments:${currentMonth}`) === undefined ? null : currentMonth,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
  const [exportEnabled, setExportEnabled] = useState(true);
  const [pdfEnabled, setPdfEnabled] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [shareEmails, setShareEmails] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem("payments-calendar-open");
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });

  function toggleCalendarOpen() {
    setCalendarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("payments-calendar-open", next ? "1" : "0");
      } catch {
        // ignore storage errors (e.g. private browsing quota)
      }
      return next;
    });
  }

  // A month visited before shows instantly from the cache; the effect below still refreshes it.
  function setSelectedMonth(month: string) {
    const cached = getCached<PaymentInstanceOut[]>(`payments:${month}`);
    if (cached) {
      setInstances(cached);
      setLoadedMonth(month);
    }
    setSelectedMonthRaw(month);
  }

  // Derived: true whenever selectedMonth hasn't finished loading yet.
  // Becomes true immediately when selectedMonth changes (same render), so no
  // synchronous setState inside useEffect is needed.
  const loading = loadedMonth !== selectedMonth;

  // Previous month's rows stay on screen (dimmed) while the new month loads, so nothing collapses or jumps.
  const staleClass = loading ? "pointer-events-none opacity-50" : "";

  const isReadOnly = selectedMonth < currentMonth;

  // Keep the cache in step with local edits so a return visit never shows stale rows.
  useEffect(() => {
    if (!loading) setCached(`payments:${selectedMonth}`, instances);
  }, [instances, loading, selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const isCurrentOrFuture = selectedMonth >= currentMonth;
    (isCurrentOrFuture ? syncInstances(selectedMonth).catch(() => {}) : Promise.resolve())
      .then(() => fetchPayments(selectedMonth))
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
          setCached(`payments:${selectedMonth}`, data);
          setLoadError(null);
          setLoadedMonth(selectedMonth);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) return;
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoadedMonth(selectedMonth);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, currentMonth, t]);

  useEffect(() => {
    if (selectedMonth !== currentMonth || loading) return;
    setOverdueBadge(instances.filter((i) => i.status === "overdue").length);
  }, [instances, selectedMonth, currentMonth, loading]);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((profile) => {
        if (cancelled) return;
        setExportEnabled(profile.export_enabled);
        setPdfEnabled(profile.pdf_enabled);
        if (!profile.share_enabled) return;
        setShareEmails(profile.share_emails);
        return apiFetch<{ configured: boolean }>("/auth/smtp-status").then((d) => {
          if (!cancelled) setShareAvailable(d?.configured ?? false);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleInstancePaid(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setDialogTarget(null);
    showToast(t("paymentPaid", { name: toastName(updated.bill_name) }));
  }

  function handleInstanceEdited(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setEditTarget(null);
    showToast(t("paymentEdited", { name: toastName(updated.bill_name) }));
  }

  function handleInstanceDeleted(id: number) {
    const name = instances.find((inst) => inst.id === id)?.bill_name ?? "";
    setInstances((prev) => prev.filter((inst) => inst.id !== id));
    setDeleteTarget(null);
    showToast(t("paymentDeleted", { name: toastName(name) }));
  }

  function handleInstanceReverted(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setRevertTarget(null);
    showToast(t("paymentReverted", { name: toastName(updated.bill_name) }));
  }

  // The year follows the selected month; arrows step ±1 month (crossing years).
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);
  const selYear = Number(selectedMonth.slice(0, 4));
  const selMonthIdx = Number(selectedMonth.slice(5, 7)) - 1;
  const selectedYear = selYear;
  function stepMonth(delta: number) {
    const d = new Date(selYear, selMonthIdx + delta);
    if (d.getFullYear() < minYear || d.getFullYear() > maxYear) return;
    setSelectedMonth(monthKey(d.getFullYear(), d.getMonth()));
  }
  // Touch swipe on the month selector: left = next month, right = previous
  const swipeMonth = useSwipe(() => stepMonth(1), () => stepMonth(-1));
  const atMinMonth = selYear <= minYear && selMonthIdx === 0;
  const atMaxMonth = selYear >= maxYear && selMonthIdx === 11;
  const monthTitle = `${monthName(selYear, selMonthIdx, locale)} ${selYear}`;

  const [statusFilter, setStatusFilter] = useSessionSet(VIEW_STATE_KEYS.paymentsStatus);
  const [categoryFilter, setCategoryFilter] = useSessionSet(VIEW_STATE_KEYS.paymentsCategories);
  const [searchQuery, setSearchQuery] = useSessionString(VIEW_STATE_KEYS.paymentsSearch);


  // A day picked in a previous month has nothing to do with the month now
  // selected — treat it as cleared without a setState-in-effect round trip.
  const dayFilter = selectedDay && selectedDay.startsWith(selectedMonth) ? selectedDay : null;

  const statusCategoryFiltered = instances.filter(
    (inst) =>
      (statusFilter.size === 0 || statusFilter.has(inst.status)) &&
      (categoryFilter.size === 0 || categoryFilter.has(String(inst.category.id))),
  );
  const filteredInstances = statusCategoryFiltered
    .filter((inst) => dayFilter === null || inst.due_date === dayFilter)
    .filter(
      (inst) =>
        !searchQuery || inst.bill_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const statusOptions = [
    { value: "upcoming", label: tRow("status.upcoming") },
    { value: "overdue", label: tRow("status.overdue") },
    { value: "paid", label: tRow("status.paid") },
  ];

  const categoryOptions = distinctCategories(instances, (inst) => inst.category).map((cat) => ({
    value: String(cat.id),
    label: categoryFilterLabel(cat, tCategories),
  }));

  const activeCategories = distinctCategories(filteredInstances, (inst) => inst.category);
  const activeCategoryKeys = activeCategories.map((cat) => String(cat.id));

  const { collapsed, toggle, collapseAll, expandAll, allCollapsed } =
    useCollapsedCategories(COLLAPSED_CATEGORIES_KEYS.payments, activeCategoryKeys);

  const [sortOption, setSortOption] = useSortOption<PaymentSortOption>(
    VIEW_STATE_KEYS.paymentsSort,
    "category-az",
    PAYMENT_SORT_OPTIONS,
  );
  const categorySortOrder: CategorySortOrder = sortOption === "category-za" ? "za" : "az";
  const sortedCategories = sortCategoriesByLabel(activeCategories, categorySortOrder, tCategories);
  const sortOptions = [
    { value: "category-az", label: tFilters("sortCategoryAsc") },
    { value: "category-za", label: tFilters("sortCategoryDesc") },
    { value: "paid-first", label: tFilters("sortPaidFirst") },
    { value: "unpaid-first", label: tFilters("sortUnpaidFirst") },
  ];

  async function handleExportXlsx(scope: ExportScope) {
    setXlsxError(null);
    setXlsxLoading(true);
    try {
      if (scope === "month") {
        await downloadXlsx(Number(selectedMonth.slice(0, 4)), locale, Number(selectedMonth.slice(5, 7)));
      } else {
        await downloadXlsx(selectedYear, locale);
      }
    } catch {
      setXlsxError(t("exportXlsxError"));
    } finally {
      setXlsxLoading(false);
    }
  }

  async function handleExportPdf(scope: ExportScope) {
    setPdfError(null);
    setPdfLoading(true);
    try {
      if (scope === "month") {
        await downloadPdf(Number(selectedMonth.slice(0, 4)), locale, Number(selectedMonth.slice(5, 7)));
      } else {
        await downloadPdf(selectedYear, locale);
      }
    } catch {
      setPdfError(t("exportPdfError"));
    } finally {
      setPdfLoading(false);
    }
  }

  const exportScopeOptions = [
    {
      value: "month" as const,
      label: t("exportXlsxMonth", {
        month: getMonthLabel(
          Number(selectedMonth.slice(0, 4)),
          Number(selectedMonth.slice(5, 7)) - 1,
          locale,
        ),
      }),
    },
    { value: "year" as const, label: t("exportXlsxYear", { year: selectedYear }) },
  ];

  const exportControls =
    exportEnabled || pdfEnabled || shareAvailable ? (
      <>
      {shareSent && (
        <p role="status" className="text-sm text-green-600 dark:text-emerald-400">
          {t("shareSent")}
        </p>
      )}
      {shareAvailable && (
        <button
          type="button"
          onClick={() => {
            setShareSent(false);
            setShareOpen(true);
          }}
          aria-label={t("shareMonth")}
          title={t("shareMonth")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400"
        >
          <Share2 size={16} />
        </button>
      )}
      {exportEnabled && (
      <Dropdown<ExportScope | "">
        variant="icon-sm"
        align="right"
        value=""
        onChange={(scope) => scope && handleExportXlsx(scope)}
        disabled={xlsxLoading}
        ariaLabel={t("exportXlsx")}
        placeholder={
          <span className="flex items-center gap-1.5">
            {xlsxLoading ? (
              <Loader2 size={14} className="animate-spin text-green-600 dark:text-emerald-400" />
            ) : (
              <FileSpreadsheet size={14} />
            )}
            XLSX
          </span>
        }
        options={exportScopeOptions}
      />
      )}
      {pdfEnabled && (
      <Dropdown<ExportScope | "">
        variant="icon-sm"
        align="right"
        value=""
        onChange={(scope) => scope && handleExportPdf(scope)}
        disabled={pdfLoading}
        ariaLabel={t("exportPdf")}
        placeholder={
          <span className="flex items-center gap-1.5">
            {pdfLoading ? (
              <Loader2 size={14} className="animate-spin text-green-600 dark:text-emerald-400" />
            ) : (
              <FileText size={14} />
            )}
            PDF
          </span>
        }
        options={exportScopeOptions}
      />
      )}
      {(xlsxError || pdfError) && (
        <p className="text-sm text-red-600 dark:text-red-400">{xlsxError ?? pdfError}</p>
      )}
      </>
    ) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-8">
      {dialogTarget && (
        <MarkPaidDialog
          instance={dialogTarget}
          isOpen={true}
          onClose={() => setDialogTarget(null)}
          onConfirm={handleInstancePaid}
        />
      )}
      {editTarget && (
        <MarkPaidDialog
          instance={editTarget}
          isOpen={true}
          mode="edit"
          onClose={() => setEditTarget(null)}
          onConfirm={handleInstanceEdited}
        />
      )}
      {deleteTarget && (
        <DeletePaymentDialog
          instance={deleteTarget}
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleInstanceDeleted}
        />
      )}
      {revertTarget && (
        <RevertPaymentDialog
          instance={revertTarget}
          isOpen={true}
          onClose={() => setRevertTarget(null)}
          onReverted={handleInstanceReverted}
        />
      )}

      {/* Page header */}
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Month selector: one card, the title is the only place the month is named */}
      <div className="mb-6" {...swipeMonth}>
        <div className="sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:px-4 sm:pt-3 sm:shadow-sm dark:sm:border-slate-700 dark:sm:bg-slate-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Stepper
              onPrev={() => stepMonth(-1)}
              onNext={() => stepMonth(1)}
              prevDisabled={atMinMonth}
              nextDisabled={atMaxMonth}
              prevLabel={t("previousMonth")}
              nextLabel={t("nextMonth")}
            >
              <StepperTitle title={monthTitle} subtitle={monthRelative(selectedMonth, currentMonth, locale)} onOpen={() => setMonthSheetOpen(true)} />
            </Stepper>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {selectedMonth !== currentMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentMonth)}
                  className="text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
                >
                  {tNav("today")}
                </button>
              )}
              {isReadOnly && (
                <span className="rounded-md px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {t("pastMonth")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {exportControls}
              </div>
            </div>
          </div>

          {/* Desktop shortcut strip; the year comes from the title */}
          <div className="relative mt-1 hidden sm:block">
            <div className="flex">
              {Array.from({ length: 12 }, (_, i) => {
                const key = monthKey(selectedYear, i);
                const isSelected = key === selectedMonth;
                const isCurrent = key === currentMonth;
                const isPast = key < currentMonth;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMonth(key)}
                    aria-current={isSelected ? "date" : undefined}
                    className={`relative flex flex-1 flex-col items-center gap-1 pb-3 pt-2.5 text-sm font-medium transition-colors focus:outline-none ${
                      isSelected
                        ? "text-green-700 dark:text-emerald-400"
                        : isPast
                        ? "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500 dark:bg-emerald-400" />
                    )}
                    {getMonthLabel(selectedYear, i, locale)}
                    <span
                      className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full transition-all ${
                        isSelected ? "bg-green-600 dark:bg-emerald-500" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {monthSheetOpen && (
          <MonthSheet
            year={selYear}
            selectedMonth={selectedMonth}
            currentMonth={currentMonth}
            minYear={minYear}
            maxYear={maxYear}
            locale={locale}
            onPick={(key) => {
              setSelectedMonth(key);
              setMonthSheetOpen(false);
            }}
            onClose={() => setMonthSheetOpen(false)}
          />
        )}

        {shareOpen && (
          <ShareMonthDialog
            month={selectedMonth}
            savedEmails={shareEmails}
            monthLabel={new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
              new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1),
            )}
            onClose={() => setShareOpen(false)}
            onSent={() => {
              setShareOpen(false);
              setShareSent(true);
            }}
          />
        )}

        {/* Search, filter & sort */}
        {!loadError && (
          <div className="mt-4 flex flex-col gap-3">
            <FiltersHeader
              activeCount={(searchQuery ? 1 : 0) + (statusFilter.size > 0 ? 1 : 0) + (categoryFilter.size > 0 ? 1 : 0) + (dayFilter ? 1 : 0)}
              onReset={() => { setSearchQuery(""); setStatusFilter(new Set()); setCategoryFilter(new Set()); setSelectedDay(null); }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={tFilters("searchPlaceholder")}
              />
              <div className="grid w-full grid-cols-1 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
                <div className="flex min-w-0 items-center gap-2 max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&_button]:w-full max-sm:[&_button]:justify-between">
                  <span className="max-sm:sr-only text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {tFilters("filterBy")}
                  </span>
                  <MultiSelectFilter
                    selected={statusFilter}
                    onChange={setStatusFilter}
                    options={categoryOptions.length ? statusOptions : []}
                    ariaLabel={tFilters("allStatuses")}
                    allLabel={tFilters("allStatuses")}
                  />
                  <MultiSelectFilter
                    selected={categoryFilter}
                    onChange={setCategoryFilter}
                    options={categoryOptions}
                    ariaLabel={tFilters("allCategories")}
                    allLabel={tFilters("allCategories")}
                  />
                </div>
                <div className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <div className="flex min-w-0 items-center gap-2 max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&_button]:w-full max-sm:[&_button]:justify-between">
                  <span className="max-sm:sr-only text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {tFilters("sortBy")}
                  </span>
                  <FilterSelect
                    value={sortOption}
                    onChange={(v) => setSortOption(v as PaymentSortOption)}
                    options={sortOptions}
                    ariaLabel={tFilters("sortBy")}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar view */}
        <div className="mt-4">
          <button
            type="button"
            onClick={toggleCalendarOpen}
            aria-expanded={calendarOpen}
            className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <ChevronRight
              size={12}
              className={`transition-transform duration-150 ${calendarOpen ? "rotate-90" : ""}`}
            />
            {t("calendarTitle")}
          </button>
          {calendarOpen && (
            <div className={`mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity dark:border-slate-700 dark:bg-slate-800 ${staleClass}`}>
              <PaymentsCalendar
                year={parseInt(selectedMonth.split("-")[0], 10)}
                month={parseInt(selectedMonth.split("-")[1], 10)}
                instances={statusCategoryFiltered}
                todayStr={todayStr}
                selectedDay={dayFilter}
                onSelectDay={(d) => setSelectedDay((prev) => (prev === d ? null : d))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Selected month header */}
      <div className="mb-4 pb-2">
        {!loadError && !(loading && instances.length === 0) && (
          <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 transition-opacity ${staleClass}`}>
            {filteredInstances.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {instances.length === 0 ? t("noPayments") : t("noFilterResults")}
              </p>
            ) : (
              <CategorySummary
                group={filteredInstances}
                todayStr={todayStr}
                labels={{
                  upcoming: t("summaryUpcoming"),
                  overdueToday: t("summaryOverdueToday"),
                  overdue: t("summaryOverdue"),
                  paid: t("summaryPaid"),
                }}
              />
            )}
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="flex shrink-0 items-center gap-1.5 ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
              >
                <ChevronsUpDown size={16} />
                {allCollapsed ? t("expandAll") : t("collapseAll")}
              </button>
          </div>
        )}
      </div>

      {/* Day filter banner: sticky so it stays visible once the calendar has scrolled away */}
      {dayFilter && !loadError && (
        <div className="sticky top-[57px] z-[5] mb-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700 shadow-sm md:top-0 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
          <CalendarDays size={20} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {t("dayFilterTitle", {
                date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
                  new Date(dayFilter + "T00:00:00"),
                ),
              })}
            </p>
            <p className="text-xs opacity-75">
              {t("dayFilterCount", { count: filteredInstances.length, total: instances.length })}
            </p>
          </div>
          <button
            onClick={() => setSelectedDay(null)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200"
          >
            <X size={12} />
            {t("clearDayFilter")}
          </button>
        </div>
      )}

      {/* Error banner */}
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && instances.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Payment list */}
      {!loadError && filteredInstances.length > 0 && (
        <div className={`flex flex-col gap-4 transition-opacity ${staleClass}`}>
          {sortedCategories.map((cat) => {
            const key = String(cat.id);
            const group = filteredInstances.filter((inst) => inst.category.id === cat.id);
            if (sortOption === "paid-first" || sortOption === "unpaid-first") {
              const sign = sortOption === "paid-first" ? -1 : 1;
              group.sort(
                (a, b) => (Number(a.status === "paid") - Number(b.status === "paid")) * sign,
              );
            }
            return (
              <div key={key}>
                <button
                  onClick={() => toggle(key)}
                  className="mb-3 flex w-full items-center gap-2.5 text-left"
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                      collapsed.has(key) ? "" : "rotate-90"
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
                    {categoryFilterLabel(cat, tCategories)}
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                    {group.length}
                  </span>
                  {collapsed.has(key) && (
                    <CategorySummary
                      group={group}
                      todayStr={todayStr}
                      labels={{
                        upcoming: t("summaryUpcoming"),
                        overdueToday: t("summaryOverdueToday"),
                        overdue: t("summaryOverdue"),
                        paid: t("summaryPaid"),
                      }}
                    />
                  )}
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
                </button>
                {!collapsed.has(key) && (
                  <div className="flex flex-col gap-2">
                    {group.map((inst) => (
                      <PaymentRow
                        key={inst.id}
                        instance={inst}
                        readOnly={false}
                        onMarkPaid={setDialogTarget}
                        onDelete={setDeleteTarget}
                        onRevert={setRevertTarget}
                        onEdit={setEditTarget}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && filteredInstances.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {instances.length === 0 ? t("noPayments") : t("noFilterResults")}
          </p>
          {instances.length === 0 && !isReadOnly && (
            <>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t("emptyHelp")}</p>
              <Link href="/dashboard/bills" className={`mt-4 ${btnPrimaryClass}`}>
                {t("addBills")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
