"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shared popup header: icon badge beside the action title, close button, optional subject underneath. */
export default function DialogHeader({
  id,
  icon,
  badgeClass,
  title,
  subtitle,
  onClose,
  busy = false,
}: {
  id: string;
  icon: ReactNode;
  /** Badge background + text colors, e.g. "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400". */
  badgeClass: string;
  title: string;
  /** Usually a <DialogSubject>. */
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("Dialog");
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${badgeClass}`}>
          {icon}
        </div>
        <h2 id={id} className="flex-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t("close")}
          className="-mr-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <X size={18} />
        </button>
      </div>
      {subtitle}
    </div>
  );
}
