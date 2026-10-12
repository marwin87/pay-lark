"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";

export function UnsavedChangesDialog({
  onLeave,
  onStay,
  t,
}: {
  onLeave: () => void;
  onStay: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <DialogShell labelledBy="unsaved-changes-dialog-title" onClose={onStay}>
        <DialogHeader
          id="unsaved-changes-dialog-title"
          badgeClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          icon={<AlertTriangle size={18} />}
          title={t("unsavedTitle")}
          onClose={onStay}
        />
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {t("unsavedDescription")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onStay}
            autoFocus
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("unsavedStay")}
          </button>
          <button
            onClick={onLeave}
            className="flex-1 rounded-lg border border-transparent bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {t("unsavedLeave")}
          </button>
        </div>
      </DialogShell>
  );
}
