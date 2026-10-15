"use client";

import PageHeader from "@/components/PageHeader";
import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { useEffect, useState } from "react";
import { ChevronRight, ChevronsUpDown, CirclePause, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  fetchBills,
  createBill,
  updateBill,
  archiveBill,
  deleteDraftBill,
  unarchiveBill,
  activateBill,
  hasDeletedFuture,
  type BillTemplateOut,
  type BillTemplateCreate,
  type BillTemplateUpdate,
} from "@/lib/bills-api";
import { SessionExpiredError } from "@/lib/api";
import { getCached, setCached } from "@/lib/page-cache";
import { fetchMe } from "@/lib/user-api";
import {
  categoryFilterLabel,
  distinctCategories,
  sortCategoriesByLabel,
  type CategorySortOrder,
} from "@/lib/categories";
import BillTemplateForm from "@/components/bills/BillTemplateForm";
import BillTemplateRow from "@/components/bills/BillTemplateRow";
import PauseConfirmDialog from "@/components/bills/PauseConfirmDialog";
import DeleteDraftDialog from "@/components/bills/DeleteDraftDialog";
import ActivateConfirmDialog from "@/components/bills/ActivateConfirmDialog";
import ResumeConfirmDialog from "@/components/bills/ResumeConfirmDialog";
import RestoreDeletedDialog from "@/components/bills/RestoreDeletedDialog";
import FilterSelect from "@/components/FilterSelect";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import SearchInput from "@/components/SearchInput";
import FiltersHeader from "@/components/FiltersHeader";
import { toastName, useToast } from "@/context/toast-context";
import { useCollapsedCategories, COLLAPSED_CATEGORIES_KEYS } from "@/hooks/useCollapsedCategories";
import { useSortOption } from "@/hooks/useSortOption";
import { useSessionBoolean, useSessionSet, useSessionString, VIEW_STATE_KEYS } from "@/hooks/useSessionState";

const CATEGORY_SORT_OPTIONS: CategorySortOrder[] = ["az", "za"];

export default function BillsPage() {
  const t = useTranslations("BillsPage");
  const tCategories = useTranslations("Categories");
  const tFilters = useTranslations("Filters");
  const [templates, setTemplates] = useState<BillTemplateOut[]>(() => getCached<BillTemplateOut[]>("bills") ?? []);
  const [loading, setLoading] = useState(() => getCached("bills") === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<number | "new" | null>(null);
  // "Paused" in the UI == `is_archived` in the API.
  const [pauseTarget, setPauseTarget] = useState<BillTemplateOut | null>(null);
  const [pausing, setPausing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillTemplateOut | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<BillTemplateOut | null>(null);
  const [resuming, setResuming] = useState(false);
  const [activateTarget, setActivateTarget] = useState<BillTemplateOut | null>(null);
  const [activating, setActivating] = useState(false);
  const [showPaused, setShowPaused] = useSessionBoolean(VIEW_STATE_KEYS.billsShowPaused);
  const [deletedFutureMap, setDeletedFutureMap] = useState<Record<number, boolean>>({});
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; name: string; data: BillTemplateUpdate } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [categoryFilter, setCategoryFilter] = useSessionSet(VIEW_STATE_KEYS.billsCategories);
  const [searchQuery, setSearchQuery] = useSessionString(VIEW_STATE_KEYS.billsSearch);
  const [defaultCurrency, setDefaultCurrency] = useState<string | null>(null);
  const showToast = useToast();
  const [highlightId, setHighlightId] = useState<number | null>(null);

  useEffect(() => {
    fetchMe().then((p) => setDefaultCurrency(p.default_currency)).catch(() => {});
  }, []);

  const pausedCount = templates.filter((tmpl) => tmpl.is_archived).length;
  const allPaused = templates.length > 0 && pausedCount === templates.length;
  const filteredTemplates = templates
    .filter((tmpl) => showPaused || !tmpl.is_archived)
    .filter((tmpl) => categoryFilter.size === 0 || categoryFilter.has(String(tmpl.category.id)))
    .filter(
      (tmpl) => !searchQuery || tmpl.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const categoryOptions = distinctCategories(templates.filter((tmpl) => showPaused || !tmpl.is_archived), (tmpl) => tmpl.category).map((cat) => ({
    value: String(cat.id),
    label: categoryFilterLabel(cat, tCategories),
  }));

  const activeCategories = distinctCategories(filteredTemplates, (tmpl) => tmpl.category);
  const activeCategoryKeys = activeCategories.map((cat) => String(cat.id));

  const { collapsed, toggle, collapseAll, expandAll, allCollapsed } =
    useCollapsedCategories(COLLAPSED_CATEGORIES_KEYS.bills, activeCategoryKeys);

  const [sortOption, setSortOption] = useSortOption<CategorySortOrder>(
    VIEW_STATE_KEYS.billsSort,
    "az",
    CATEGORY_SORT_OPTIONS,
  );
  const sortedCategories = sortCategoriesByLabel(activeCategories, sortOption, tCategories);
  const sortOptions = [
    { value: "az", label: tFilters("sortCategoryAsc") },
    { value: "za", label: tFilters("sortCategoryDesc") },
  ];

  // Scroll the saved bill into view (again after the refetch re-sorts the list), then fade the highlight.
  useEffect(() => {
    if (highlightId === null) return;
    document.getElementById(`bill-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, templates, collapsed]);

  useEffect(() => {
    if (highlightId === null) return;
    const id = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(id);
  }, [highlightId]);

  useEffect(() => {
    let cancelled = false;
    fetchBills(true)
      .then((data) => {
        setCached("bills", data);
        if (!cancelled) {
          setTemplates(data);
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) return;
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t]);

  // Confirm a save: toast, and make sure the saved bill is on screen and highlighted
  // (a new or recategorised bill may sit in a collapsed group or behind a filter).
  function reveal(bill: BillTemplateOut, message: string) {
    const key = String(bill.category.id);
    if (searchQuery && !bill.name.toLowerCase().includes(searchQuery.toLowerCase())) setSearchQuery("");
    if (categoryFilter.size > 0 && !categoryFilter.has(key)) setCategoryFilter(new Set());
    if (collapsed.has(key)) toggle(key);
    setHighlightId(bill.id);
    showToast(message);
  }

  async function handleCreate(data: BillTemplateCreate) {
    const bill = await createBill(data);
    setExpandedId(null);
    reveal(bill, t("billAdded", { name: toastName(bill.name) }));
    setRefreshKey((k) => k + 1);
  }

  async function doUpdate(id: number, data: BillTemplateUpdate) {
    const bill = await updateBill(id, data);
    setExpandedId(null);
    reveal(bill, t("billSaved", { name: toastName(bill.name) }));
    setRefreshKey((k) => k + 1);
    setDeletedFutureMap((m) => { const copy = { ...m }; delete copy[id]; return copy; });
  }

  async function handleUpdate(id: number, data: BillTemplateUpdate) {
    if (deletedFutureMap[id]) {
      const name = templates.find((t) => t.id === id)?.name ?? "";
      setRestoreTarget({ id, name, data });
      return;
    }
    await doUpdate(id, data);
  }

  async function handleRestoreConfirm() {
    if (!restoreTarget || restoring) return;
    setRestoring(true);
    try {
      await doUpdate(restoreTarget.id, { ...restoreTarget.data, recreate_deleted_future: true });
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }

  async function handleRestoreSkip() {
    if (!restoreTarget) return;
    const { id, data } = restoreTarget;
    try {
      await doUpdate(id, data);
      setRestoreTarget(null);
    } catch {
      // leave dialog open so user can retry
    }
  }

  async function handleActivateConfirm() {
    if (!activateTarget || activating) return;
    setActivating(true);
    try {
      await activateBill(activateTarget.id);
      setExpandedId(null);
      reveal(activateTarget, t("billActivated", { name: toastName(activateTarget.name) }));
      setActivateTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      setLoadError(err instanceof Error ? err.message : t("activateError"));
      setActivateTarget(null);
    } finally {
      setActivating(false);
    }
  }

  async function handlePauseConfirm() {
    if (!pauseTarget || pausing) return;
    setPausing(true);
    try {
      await archiveBill(pauseTarget.id);
      showToast(t("billPaused", { name: toastName(pauseTarget.name) }));
      setPauseTarget(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setPausing(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteDraftBill(deleteTarget.id);
      showToast(t("billDeleted", { name: toastName(deleteTarget.name) }));
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setDeleting(false);
    }
  }

  async function handleResumeConfirm() {
    if (!resumeTarget || resuming) return;
    setResuming(true);
    try {
      await unarchiveBill(resumeTarget.id);
      showToast(t("billResumed", { name: toastName(resumeTarget.name) }));
      setResumeTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      setLoadError(err instanceof Error ? err.message : t("resumeError"));
      setResumeTarget(null);
    } finally {
      setResuming(false);
    }
  }

  function toggleExpand(id: number | "new") {
    setExpandedId((prev) => {
      const opening = prev !== id;
      if (opening && typeof id === "number") {
        hasDeletedFuture(id)
          .then((res) => setDeletedFutureMap((m) => ({ ...m, [id]: res.has_deleted_future })))
          .catch(() => {/* fail silently — no tombstone prompt this session */});
      }
      return opening ? id : null;
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-8">
      {pauseTarget && (
        <PauseConfirmDialog
          billName={pauseTarget.name}
          onConfirm={handlePauseConfirm}
          onCancel={() => setPauseTarget(null)}
          pausing={pausing}
        />
      )}

      {deleteTarget && (
        <DeleteDraftDialog
          billName={deleteTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
      {activateTarget && (
        <ActivateConfirmDialog
          billName={activateTarget.name}
          onConfirm={handleActivateConfirm}
          onCancel={() => setActivateTarget(null)}
          activating={activating}
        />
      )}
      {resumeTarget && (
        <ResumeConfirmDialog
          billName={resumeTarget.name}
          onConfirm={handleResumeConfirm}
          onCancel={() => setResumeTarget(null)}
          resuming={resuming}
        />
      )}

      {restoreTarget && (
        <RestoreDeletedDialog
          billName={restoreTarget.name}
          onRestore={handleRestoreConfirm}
          onSkip={handleRestoreSkip}
          restoring={restoring}
        />
      )}

      {/* Page header */}
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => toggleExpand("new")}
              className="flex items-center gap-2 rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-medium text-green-700 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-800 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
            >
              <Plus size={16} />
              {expandedId === "new" ? t("cancel") : t("newBill")}
            </button>
            {pausedCount > 0 && (
              <button
                onClick={() => setShowPaused(!showPaused)}
                aria-pressed={showPaused}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-sm transition-all sm:px-4 ${
                  showPaused
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                }`}
              >
                <CirclePause size={16} />
                {showPaused ? t("hidePaused") : t("showPaused")}
                <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {pausedCount}
                </span>
              </button>
            )}
          </div>
          {templates.length > 0 && (
            <>
            <FiltersHeader
              activeCount={(searchQuery ? 1 : 0) + (categoryFilter.size > 0 ? 1 : 0)}
              onReset={() => { setSearchQuery(""); setCategoryFilter(new Set()); }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={tFilters("searchPlaceholder")}
              />
              <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
                <div className="flex min-w-0 items-center gap-2 max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&_button]:w-full max-sm:[&_button]:justify-between">
                  <span className="max-sm:sr-only text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {tFilters("filterBy")}
                  </span>
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
                    onChange={(v) => setSortOption(v as CategorySortOrder)}
                    options={sortOptions}
                    ariaLabel={tFilters("sortBy")}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="border-t border-slate-200 dark:border-slate-700 sm:h-px sm:w-1/2 sm:self-end sm:border-t-0 sm:bg-gradient-to-r sm:from-transparent sm:to-slate-300 dark:sm:to-slate-600" />
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 w-full justify-center sm:w-auto sm:self-end"
              >
                <ChevronsUpDown size={16} />
                {allCollapsed ? t("expandAll") : t("collapseAll")}
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Inline create form */}
      {expandedId === "new" && (
        <div className="mb-4 rounded-xl border border-green-200 bg-white shadow-sm dark:border-green-900 dark:bg-slate-800">
          <div className="rounded-t-xl border-b border-green-100 bg-green-50 px-5 py-3 dark:border-green-900 dark:bg-green-900/20">
            <h2 className="text-sm font-semibold text-green-800 dark:text-green-300">{t("newBill")}</h2>
          </div>
          <div className="p-5">
            <BillTemplateForm
              onSave={handleCreate}
              onCancel={() => setExpandedId(null)}
              defaultCurrency={defaultCurrency}
            />
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      ) : templates.every((tmpl) => tmpl.is_archived) && !showPaused && expandedId !== "new" ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <div
            className={`mb-3 rounded-full p-4 ${
              allPaused
                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-green-100 text-green-700 dark:bg-green-900/30"
            }`}
          >
            {allPaused ? <CirclePause size={28} /> : <Plus size={28} />}
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {allPaused ? t("allPaused") : t("noBillsYet")}
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {allPaused ? t("allPausedHelp") : t("emptyHelp")}
          </p>
          <button
            onClick={() => (allPaused ? setShowPaused(true) : toggleExpand("new"))}
            className={`mt-4 ${btnPrimaryClass}`}
          >
            {allPaused ? t("showPaused") : t("addFirstBill")}
          </button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-300">{t("noFilterResults")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedCategories.map((cat) => {
            const key = String(cat.id);
            const group = filteredTemplates
              .filter((tmpl) => tmpl.category.id === cat.id)
              .sort((a, b) => a.name.localeCompare(b.name));
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
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
                </button>
                {!collapsed.has(key) && (
                  <div className="flex flex-col gap-2">
                    {group.map((tmpl) => (
                      <BillTemplateRow
                        key={tmpl.id}
                        template={tmpl}
                        isExpanded={expandedId === tmpl.id}
                        highlighted={highlightId === tmpl.id}
                        onEditToggle={() => toggleExpand(tmpl.id)}
                        onSave={(data) => handleUpdate(tmpl.id, data)}
                        onPause={() => setPauseTarget(tmpl)}
                        onDelete={() => setDeleteTarget(tmpl)}
                        onResume={() => setResumeTarget(tmpl)}
                        onActivate={() => setActivateTarget(tmpl)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
