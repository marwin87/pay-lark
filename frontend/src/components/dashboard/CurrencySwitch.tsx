"use client";

import Dropdown from "@/components/ui/Dropdown";

const MAX_SEGMENTS = 3;

/**
 * Picks the dashboard currency. The segments are the currencies that have bills this month
 * (`active`, biggest first, at most three); every other currency with data sits in a
 * dropdown. A currency picked from the dropdown takes the last segment's place (or the next
 * free one) so the current choice is always visible.
 */
export default function CurrencySwitch({
  currencies,
  active,
  value,
  onChange,
  label,
}: {
  currencies: string[];
  active: string[];
  value: string;
  onChange: (currency: string) => void;
  label: string;
}) {
  const top = active.slice(0, MAX_SEGMENTS);
  const segments = top.includes(value)
    ? top
    : [...top.slice(0, MAX_SEGMENTS - 1), value];
  const rest = currencies.filter((c) => !segments.includes(c));

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900/40">
        {segments.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === value}
            onClick={() => onChange(c)}
            className={`min-w-16 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              c === value
                ? "bg-white text-green-700 shadow-sm dark:bg-slate-700 dark:text-green-300"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {rest.length > 0 && (
        <Dropdown
          value=""
          onChange={onChange}
          options={rest.map((c) => ({ value: c, label: c }))}
          placeholder={`+${rest.length}`}
          ariaLabel={label}
          variant="icon"
          scrollable
        />
      )}
    </div>
  );
}
