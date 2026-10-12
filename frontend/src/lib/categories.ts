import type { Category } from "./categories-api";

// Fixed color palette every category (default or user-created) picks from.
// Must stay in sync with backend's CATEGORY_COLORS (app/services/categories.py).
export const CATEGORY_COLORS = [
  "blue",
  "purple",
  "rose",
  "orange",
  "slate",
  "violet",
  "cyan",
  "emerald",
  "slate-light",
  "yellow",
  "lime",
  "pink",
  "blue-dark",
  "emerald-dark",
  "rose-dark",
  "orange-dark",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

const FALLBACK_COLOR: CategoryColor = "slate";

export const CATEGORY_COLOR_BORDER: Record<CategoryColor, string> = {
  blue: "border-l-blue-400 dark:border-l-blue-500",
  purple: "border-l-purple-400 dark:border-l-purple-500",
  rose: "border-l-rose-400 dark:border-l-rose-500",
  orange: "border-l-orange-400 dark:border-l-orange-500",
  slate: "border-l-slate-400 dark:border-l-slate-500",
  violet: "border-l-violet-400 dark:border-l-violet-500",
  cyan: "border-l-cyan-500 dark:border-l-cyan-400",
  emerald: "border-l-emerald-400 dark:border-l-emerald-500",
  "slate-light": "border-l-slate-300 dark:border-l-slate-600",
  yellow: "border-l-yellow-400 dark:border-l-yellow-500",
  lime: "border-l-lime-400 dark:border-l-lime-500",
  pink: "border-l-pink-400 dark:border-l-pink-500",
  "blue-dark": "border-l-blue-700 dark:border-l-blue-600",
  "emerald-dark": "border-l-emerald-700 dark:border-l-emerald-600",
  "rose-dark": "border-l-rose-700 dark:border-l-rose-600",
  "orange-dark": "border-l-orange-800 dark:border-l-orange-700",
};

// Solid swatch classes for the color picker in the category management UI.
export const CATEGORY_COLOR_SWATCH: Record<CategoryColor, string> = {
  blue: "bg-blue-400 dark:bg-blue-500",
  purple: "bg-purple-400 dark:bg-purple-500",
  rose: "bg-rose-400 dark:bg-rose-500",
  orange: "bg-orange-400 dark:bg-orange-500",
  slate: "bg-slate-400 dark:bg-slate-500",
  violet: "bg-violet-400 dark:bg-violet-500",
  cyan: "bg-cyan-500 dark:bg-cyan-400",
  emerald: "bg-emerald-400 dark:bg-emerald-500",
  "slate-light": "bg-slate-300 dark:bg-slate-600",
  yellow: "bg-yellow-400 dark:bg-yellow-500",
  lime: "bg-lime-400 dark:bg-lime-500",
  pink: "bg-pink-400 dark:bg-pink-500",
  "blue-dark": "bg-blue-700 dark:bg-blue-600",
  "emerald-dark": "bg-emerald-700 dark:bg-emerald-600",
  "rose-dark": "bg-rose-700 dark:bg-rose-600",
  "orange-dark": "bg-orange-800 dark:bg-orange-700",
};

// Stroke classes for SVG charts (donut segments); same hues as the swatches above.
export const CATEGORY_COLOR_STROKE: Record<CategoryColor, string> = {
  blue: "stroke-blue-400 dark:stroke-blue-500",
  purple: "stroke-purple-400 dark:stroke-purple-500",
  rose: "stroke-rose-400 dark:stroke-rose-500",
  orange: "stroke-orange-400 dark:stroke-orange-500",
  slate: "stroke-slate-400 dark:stroke-slate-500",
  violet: "stroke-violet-400 dark:stroke-violet-500",
  cyan: "stroke-cyan-500 dark:stroke-cyan-400",
  emerald: "stroke-emerald-400 dark:stroke-emerald-500",
  "slate-light": "stroke-slate-300 dark:stroke-slate-600",
  yellow: "stroke-yellow-400 dark:stroke-yellow-500",
  lime: "stroke-lime-400 dark:stroke-lime-500",
  pink: "stroke-pink-400 dark:stroke-pink-500",
  "blue-dark": "stroke-blue-700 dark:stroke-blue-600",
  "emerald-dark": "stroke-emerald-700 dark:stroke-emerald-600",
  "rose-dark": "stroke-rose-700 dark:stroke-rose-600",
  "orange-dark": "stroke-orange-800 dark:stroke-orange-700",
};

export function categoryStrokeClass(color: string): string {
  return CATEGORY_COLOR_STROKE[color as CategoryColor] ?? CATEGORY_COLOR_STROKE[FALLBACK_COLOR];
}

export function categorySwatchClass(color: string): string {
  return CATEGORY_COLOR_SWATCH[color as CategoryColor] ?? CATEGORY_COLOR_SWATCH[FALLBACK_COLOR];
}

export function categoryBorderClass(color: string): string {
  return CATEGORY_COLOR_BORDER[color as CategoryColor] ?? CATEGORY_COLOR_BORDER[FALLBACK_COLOR];
}

// Seeded default categories keep their translated label (looked up by slug,
// e.g. "housing" -> Categories.housing); user-created ones have no slug and
// just show their free-text name. A renamed default (name no longer equals its
// seeded slug) shows the user's name instead of the translation.
export function categoryLabel(
  category: Pick<Category, "slug" | "name">,
  t: (key: string) => string,
): string {
  return category.slug && category.name.toLowerCase() === category.slug
    ? t(category.slug)
    : category.name;
}

// Filter dropdown label — flags archived categories so users aren't
// surprised to see one they thought they removed.
export function categoryFilterLabel(
  category: Pick<Category, "slug" | "name" | "is_archived">,
  t: (key: string) => string,
): string {
  const label = categoryLabel(category, t);
  return category.is_archived ? `${label} ${t("archivedSuffix")}` : label;
}

// Distinct categories referenced by a list of items, sorted by sort_order —
// used to build filter dropdowns and group headers from live data instead of
// a hardcoded category list.
export function distinctCategories<T>(
  items: readonly T[],
  getCategory: (item: T) => Category,
): Category[] {
  const map = new Map<number, Category>();
  for (const item of items) {
    const category = getCategory(item);
    map.set(category.id, category);
  }
  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export type CategorySortOrder = "az" | "za";

// Reorders category group headers by translated label.
export function sortCategoriesByLabel<T extends Pick<Category, "slug" | "name">>(
  categories: T[],
  order: CategorySortOrder,
  t: (key: string) => string,
): T[] {
  const sorted = [...categories].sort((a, b) => categoryLabel(a, t).localeCompare(categoryLabel(b, t)));
  return order === "za" ? sorted.reverse() : sorted;
}
