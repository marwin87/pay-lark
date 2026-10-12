import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export const NAV_BTN =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:w-9 dark:text-slate-400 dark:hover:bg-slate-700/50";

// On mobile the arrows are raised white chips inside a tinted tile, like the day-filter banner on Payments.
const ARROW_BTN = `${NAV_BTN} max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm max-sm:hover:border-slate-300 dark:max-sm:border-slate-600 dark:max-sm:bg-slate-800`;

/** Prev / next arrows around a title: a tinted full-width tile on mobile, bare inline arrows from `sm` up. */
export default function Stepper({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  prevLabel,
  nextLabel,
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-1.5 sm:w-auto sm:justify-start sm:gap-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 dark:border-slate-700 dark:bg-slate-900/40 dark:sm:bg-transparent">
      <button type="button" onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel} title={prevLabel} className={ARROW_BTN}>
        <ChevronLeft size={20} />
      </button>
      {children}
      <button type="button" onClick={onNext} disabled={nextDisabled} aria-label={nextLabel} title={nextLabel} className={ARROW_BTN}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

/** "This month", "Last month", "3 months ago", "In 2 months" in the user's language. */
export function monthRelative(month: string, currentMonth: string, locale: string): string {
  const idx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(idx(month) - idx(currentMonth), "month");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Stepper title: two lines (title + subtitle), tappable when `onOpen` is set . */
export function StepperTitle({
  id,
  title,
  subtitle,
  onOpen,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-base font-semibold capitalize leading-tight text-slate-800 dark:text-slate-100">
        {title}
        {onOpen && <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />}
      </span>
      {subtitle && <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
    </>
  );
  const box = "flex h-12 w-full flex-col items-center justify-center sm:hidden";
  return (
    <h2 id={id} className="min-w-0 flex-1 text-center sm:min-w-[11rem] sm:flex-none">
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-haspopup="dialog" className={box}>
          {body}
        </button>
      ) : (
        <span className={box}>{body}</span>
      )}
      <span className="hidden text-xl font-semibold capitalize text-slate-800 sm:inline dark:text-slate-100">{title}</span>
    </h2>
  );
}
