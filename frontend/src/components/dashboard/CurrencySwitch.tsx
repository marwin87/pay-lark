"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Dropdown from "@/components/ui/Dropdown";

// Chrome around the segments (padding + border of the pill) and next to them (gap + "+N" button).
const PILL_CHROME = 10;
const GAP = 8;
const MORE_WIDTH = 80;

const SEGMENT_CLASS = "min-w-16 rounded-lg px-4 py-1.5 text-sm font-medium transition-all";

/**
 * Picks the dashboard currency. Every currency is a segment while they all fit on one line;
 * when they don't, the first ones that fit stay and the rest move into a "+N" dropdown.
 * Currencies with bills this month (`active`, biggest first) come first. A currency picked
 * from the dropdown takes the last segment's place so the current choice is always visible.
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
  const order = [...active, ...currencies.filter((c) => !active.includes(c))];
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(order.length);
  const orderKey = order.join();

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const compute = () => {
      const widths = [...measure.children].map((c) => (c as HTMLElement).offsetWidth);
      const available = wrap.clientWidth;
      const upTo = (n: number) => widths.slice(0, n).reduce((a, b) => a + b, 0) + PILL_CHROME;
      if (upTo(widths.length) <= available) {
        setFit(widths.length);
        return;
      }
      let n = widths.length - 1;
      while (n > 1 && upTo(n) + GAP + MORE_WIDTH > available) n--;
      setFit(Math.max(1, n));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [orderKey]);

  const shown = order.slice(0, fit);
  if (fit < order.length && !shown.includes(value)) shown[fit - 1] = value;
  const rest = order.filter((c) => !shown.includes(c));

  return (
    <div ref={wrapRef} role="group" aria-label={label} className="relative flex items-center gap-2">
      {/* Unseen copy of every segment, only there to measure how many fit */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute flex">
        {order.map((c) => (
          <span key={c} className={SEGMENT_CLASS}>{c}</span>
        ))}
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900/40">
        {shown.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === value}
            onClick={() => onChange(c)}
            className={`${SEGMENT_CLASS} ${
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
