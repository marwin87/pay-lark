"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { usePopupPosition } from "./usePopupPosition";

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown in the closed trigger instead of `label` (e.g. a currency code for a narrow field). */
  short?: ReactNode;
}

const FIELD_TRIGGER_CLASS =
  "flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors hover:border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:border-green-600 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const PILL_TRIGGER_CLASS =
  "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-3 pr-2.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm outline-none transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:focus:border-green-600 dark:focus:ring-green-900/40 cursor-pointer";

const PILL_SM_TRIGGER_CLASS = PILL_TRIGGER_CLASS.replace("py-1.5", "py-2.5").replace("rounded-lg", "rounded-xl");

// Icon-only square button, same look as the Share button on Payments.
const ICON_TRIGGER_CLASS =
  "flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 shadow-sm outline-none transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400 dark:focus:border-green-600 dark:focus:ring-green-900/40 aria-expanded:border-green-300 aria-expanded:bg-green-50 aria-expanded:text-green-700 dark:aria-expanded:border-green-700 dark:aria-expanded:bg-green-900/20 dark:aria-expanded:text-green-400 cursor-pointer";

// Compact (h-9) icon trigger for toolbars next to 36px nav buttons.
const ICON_SM_TRIGGER_CLASS = ICON_TRIGGER_CLASS.replace("px-3 py-2.5 text-sm", "h-9 px-2.5 text-xs");

const TRIGGER_VARIANTS = {
  icon: ICON_TRIGGER_CLASS,
  "icon-sm": ICON_SM_TRIGGER_CLASS,
  field: FIELD_TRIGGER_CLASS,
  pill: PILL_TRIGGER_CLASS,
  "pill-sm": PILL_SM_TRIGGER_CLASS,
};

const OPTION_TEXT_SIZE: Record<keyof typeof TRIGGER_VARIANTS, string> = {
  field: "text-sm",
  pill: "text-sm",
  "pill-sm": "text-sm",
  icon: "text-sm",
  "icon-sm": "text-sm",
};

interface Props<T extends string> {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  ariaLabel?: string;
  placeholder?: ReactNode;
  variant?: keyof typeof TRIGGER_VARIANTS;
  scrollable?: boolean;
  disabled?: boolean;
  /** Which edge the popup lines up with — use "right" for triggers at the right edge of the page. */
  align?: "left" | "right";
}

export default function Dropdown<T extends string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  variant = "field",
  scrollable,
  disabled,
  align = "left",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  usePopupPosition({ open, triggerRef, popupRef, onClose: () => setOpen(false), align, width: "min" });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      const isArrow = e.key === "ArrowDown" || e.key === "ArrowUp";
      const isEdge = e.key === "Home" || e.key === "End";
      if (!isArrow && !isEdge) return;
      e.preventDefault();
      const count = options.length;
      if (count === 0) return;
      const current = optionRefs.current.findIndex(
        (el) => el === document.activeElement,
      );
      let next: number;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = count - 1;
      else if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % count;
      else next = current < 0 ? count - 1 : (current - 1 + count) % count;
      optionRefs.current[next]?.focus();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, options.length]);

  // Move focus into the listbox when it opens: the selected option, or the first.
  // Reads options/value from refs (not deps) so a parent re-render while open
  // doesn't yank focus away from whatever option arrow-key nav has reached.
  const latestOptions = useRef(options);
  const latestValue = useRef(value);
  useEffect(() => {
    latestOptions.current = options;
    latestValue.current = value;
  });
  useEffect(() => {
    if (!open) return;
    const selectedIndex = latestOptions.current.findIndex(
      (o) => o.value === latestValue.current,
    );
    optionRefs.current[selectedIndex < 0 ? 0 : selectedIndex]?.focus({ preventScroll: true });
  }, [open]);

  const selected = options.find((o) => o.value === value);

  function handleSelect(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={variant === "icon" || variant === "icon-sm" ? ariaLabel : undefined}
        disabled={disabled}
        className={`${TRIGGER_VARIANTS[variant]} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="flex-1 truncate text-left">
          {selected ? (selected.short ?? selected.label) : placeholder}
        </span>
        <ChevronDown size={variant === "pill-sm" ? 16 : 14} className="shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          className="fixed w-max max-w-xs rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          <div className={scrollable ? "max-h-64 overflow-y-auto" : undefined}>
            {options.map((opt, i) => (
              <button
                key={opt.value}
                ref={(el) => { optionRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => handleSelect(opt.value)}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left ${OPTION_TEXT_SIZE[variant]} transition-colors ${
                  opt.value === value
                    ? "bg-green-700 font-semibold text-white"
                    : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
