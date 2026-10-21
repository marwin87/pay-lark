"use client";

import { useEffect, useState } from "react";
import { Tag, Pencil, Plus, ArchiveRestore, Archive, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  deleteCategory,
  unarchiveCategory,
  type Category,
} from "@/lib/categories-api";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_SWATCH,
  categoryLabel,
  sortCategoriesByLabel,
} from "@/lib/categories";
import { btnSaveClass, btnCancelClass } from "@/components/ui/formButtonClasses";
import { ColorPicker } from "@/components/ui/CategoryColorPicker";
import { Tile } from "./Tile";
import CategoryConfirmDialog from "./CategoryConfirmDialog";
import { useToast } from "@/context/toast-context";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const rowBtnClass =
  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium shadow-sm transition-all dark:border-slate-700 dark:bg-slate-800 sm:px-2.5";
const rowIconClass = "shrink-0 h-[15px] w-[15px]";

export function CategoriesTile({
  t,
  isCollapsed,
  onToggle,
}: {
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tc = useTranslations("SettingsPage");
  const showToast = useToast();
  const tCategories = useTranslations("Categories");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<{ cat: Category; mode: "delete" | "archive" } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function reload() {
    return fetchCategories(true)
      .then((data) => {
        setCategories(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : tc("categories.loadError"));
      });
  }

  useEffect(() => {
    let cancelled = false;
    fetchCategories(true)
      .then((data) => {
        if (!cancelled) {
          setCategories(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tc("categories.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tc]);

  // Colors used by OTHER categories — excludes the row being edited so its own
  // current color still shows as "unused" rather than crossing itself off.
  function usedColorsExcluding(excludeId: number | "new" | null): Set<string> {
    return new Set(categories.filter((c) => c.id !== excludeId).map((c) => c.color));
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(categoryLabel(cat, tCategories));
    setEditColor(cat.color);
    setRowError(null);
  }

  function startNew() {
    const unusedColor = CATEGORY_COLORS.find((c) => !usedColorsExcluding("new").has(c));
    setEditingId("new");
    setEditName("");
    setEditColor(unusedColor ?? CATEGORY_COLORS[0]);
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit() {
    if (!editName.trim()) {
      setRowError(tc("categories.nameRequired"));
      return;
    }
    setSaving(true);
    setRowError(null);
    try {
      if (editingId === "new") {
        await createCategory({ name: editName.trim(), color: editColor });
      } else if (editingId !== null) {
        await updateCategory(editingId, { name: editName.trim(), color: editColor });
      }
      setEditingId(null);
      reload();
      showToast(tc("categorySaved"));
    } catch (err) {
      setRowError(err instanceof Error ? err.message : tc("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function restore(cat: Category) {
    try {
      await unarchiveCategory(cat.id);
      reload();
      showToast(tc("categoryRestored"));
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("categories.loadError"));
    }
  }

  async function confirmRemove() {
    if (!confirming) return;
    setRemoving(true);
    await remove(confirming.cat);
    setRemoving(false);
    setConfirming(null);
  }

  async function archive(cat: Category) {
    await archiveCategory(cat.id);
    showToast(tc("categoryInUseArchived"));
  }

  // Archive when a bill uses it, else delete (a 409 means a bill started using it meanwhile).
  async function remove(cat: Category) {
    try {
      if (cat.in_use) {
        await archive(cat);
      } else {
        try {
          await deleteCategory(cat.id);
          showToast(tc("categoryDeleted"));
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) throw err;
          await archive(cat);
        }
      }
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("categories.loadError"));
    }
  }

  return (
    <Tile
      color="green"
      icon={Tag}
      title={tc("categories.title")}
      description={tc("categories.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      {loading && (
        <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="space-y-2">
          {sortCategoriesByLabel(categories, "az", tCategories)
            .map((cat) =>
              editingId === cat.id ? (
                <div
                  key={cat.id}
                  className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-900/10"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                    maxLength={50}
                  />
                  <ColorPicker
                    value={editColor}
                    onChange={setEditColor}
                    usedColors={usedColorsExcluding(cat.id)}
                    newLabel={tc("categories.newColorsLabel")}
                    usedLabel={tc("categories.usedColorsLabel")}
                  />
                  {rowError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className={btnCancelClass}
                    >
                      {tc("cancel")}
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className={btnSaveClass}
                    >
                      {saving ? tc("saving") : tc("save")}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 ${
                    cat.is_archived ? "opacity-50" : ""
                  }`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full ${CATEGORY_COLOR_SWATCH[cat.color as (typeof CATEGORY_COLORS)[number]] ?? CATEGORY_COLOR_SWATCH.slate}`}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">
                    {categoryLabel(cat, tCategories)}
                  </span>
                  {cat.is_archived ? (
                    <button
                      onClick={() => restore(cat)}
                      aria-label={tc("categories.unarchive")}
                      className={`${rowBtnClass} text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400`}
                    >
                      <ArchiveRestore className={rowIconClass} />
                      <span className="hidden sm:inline">{tc("categories.unarchive")}</span>
                    </button>
                  ) : cat.in_use ? (
                    <button
                      onClick={() => setConfirming({ cat, mode: "archive" })}
                      aria-label={tc("categories.archive")}
                      className={`${rowBtnClass} text-slate-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:text-slate-500 dark:hover:border-amber-800 dark:hover:bg-amber-900/20 dark:hover:text-amber-400`}
                    >
                      <Archive className={rowIconClass} />
                      <span className="hidden sm:inline">{tc("categories.archive")}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming({ cat, mode: "delete" })}
                      aria-label={tc("categories.delete")}
                      className={`${rowBtnClass} text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-slate-500 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400`}
                    >
                      <Trash2 className={rowIconClass} />
                      <span className="hidden sm:inline">{tc("categories.delete")}</span>
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(cat)}
                    aria-label={tc("categories.edit")}
                    className={`${rowBtnClass} text-slate-500 hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400`}
                  >
                    <Pencil className={rowIconClass} />
                    <span className="hidden sm:inline">{tc("categories.edit")}</span>
                  </button>
                </div>
              ),
            )}

          {editingId === "new" ? (
            <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-900/10">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={tc("categories.namePlaceholder")}
                className={inputClass}
                maxLength={50}
                autoFocus
              />
              <ColorPicker
                value={editColor}
                onChange={setEditColor}
                usedColors={usedColorsExcluding("new")}
                newLabel={tc("categories.newColorsLabel")}
                usedLabel={tc("categories.usedColorsLabel")}
              />
              {rowError && <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className={btnCancelClass}
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className={btnSaveClass}
                >
                  {saving ? tc("saving") : tc("save")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            >
              <Plus size={18} />
              {tc("categories.addNew")}
            </button>
          )}
        </div>
      )}
      {confirming && (
        <CategoryConfirmDialog
          mode={confirming.mode}
          name={categoryLabel(confirming.cat, tCategories)}
          onConfirm={confirmRemove}
          onCancel={() => setConfirming(null)}
          busy={removing}
        />
      )}
    </Tile>
  );
}
