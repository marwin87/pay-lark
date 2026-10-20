"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchCategories, createCategory, type Category } from "@/lib/categories-api";
import { CATEGORY_COLORS, categoryLabel, sortCategoriesByLabel } from "@/lib/categories";
import { useToast } from "@/context/toast-context";
import Dropdown from "@/components/ui/Dropdown";
import { ColorPicker } from "@/components/ui/CategoryColorPicker";
import { btnSaveClass, btnCancelClass } from "@/components/ui/formButtonClasses";

interface Props {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

export default function CategoryCombobox({ id, value, onChange }: Props) {
  const t = useTranslations("Categories");
  const ts = useTranslations("SettingsPage");
  const showToast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Fetch archived categories too — an archived category can still be the
    // bill's current value and must stay visible in that case, just not
    // offered for newly-picked bills (filtered out below unless selected).
    fetchCategories(true)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* combobox stays empty; form validation still requires a pick */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = sortCategoriesByLabel(
    categories.filter((cat) => !cat.is_archived || cat.id === value),
    "az",
    t,
  );

  const options = [
    { value: "", label: "—" },
    ...categoryOptions.map((cat) => ({
      value: String(cat.id),
      label: categoryLabel(cat, t),
    })),
  ];

  function startCreate() {
    const used = new Set(categories.map((c) => c.color));
    setColor(CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[0]);
    setName("");
    setError(null);
    setCreating(true);
  }

  async function saveNew() {
    if (!name.trim()) {
      setError(ts("categories.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cat = await createCategory({ name: name.trim(), color });
      setCategories((prev) => [...prev, cat]);
      onChange(cat.id);
      setCreating(false);
      showToast(ts("categorySaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : ts("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Dropdown
        id={id}
        value={value === "" ? "" : String(value)}
        onChange={(v) => {
          setCreating(false);
          onChange(v === "" ? "" : Number(v));
        }}
        options={options}
        scrollable
      />
      {!creating && (
        <button
          type="button"
          onClick={startCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
        >
          <Plus size={18} />
          {ts("categories.addNew")}
        </button>
      )}
      {creating && (
        <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-900/10">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ts("categories.namePlaceholder")}
            className={inputClass}
            maxLength={50}
            autoFocus
          />
          <ColorPicker
            value={color}
            onChange={setColor}
            usedColors={new Set(categories.map((c) => c.color))}
            newLabel={ts("categories.newColorsLabel")}
            usedLabel={ts("categories.usedColorsLabel")}
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={saving}
              className={btnCancelClass}
            >
              {ts("cancel")}
            </button>
            <button type="button" onClick={saveNew} disabled={saving} className={btnSaveClass}>
              {saving ? ts("saving") : ts("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
