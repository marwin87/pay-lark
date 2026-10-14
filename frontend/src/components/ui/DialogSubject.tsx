import type { ReactNode } from "react";

/** What a popup acts on: name, optional meta line and right-hand detail, optional category dot. */
export default function DialogSubject({
  name,
  meta,
  dotClass,
  right,
  toneClass = "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
}: {
  name: string;
  meta?: string;
  /** Category swatch classes (see categorySwatchClass). */
  dotClass?: string;
  right?: ReactNode;
  /** Border + background classes; defaults to neutral slate. */
  toneClass?: string;
}) {
  return (
    <div className={`mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 ${toneClass}`}>
      {dotClass && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</p>
        {meta && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
      </div>
      {right && <div className="shrink-0 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">{right}</div>}
    </div>
  );
}
