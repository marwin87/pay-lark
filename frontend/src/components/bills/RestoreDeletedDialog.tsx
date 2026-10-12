"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";
import DialogSubject from "@/components/ui/DialogSubject";

interface Props {
  billName: string;
  onRestore: () => void;
  onSkip: () => void;
  restoring?: boolean;
}

export default function RestoreDeletedDialog({ billName, onRestore, onSkip, restoring = false }: Props) {
  const t = useTranslations("RestoreDeletedDialog");
  return (
    <DialogShell labelledBy="restore-deleted-dialog-title" onClose={onSkip} busy={restoring}>
        <DialogHeader
          id="restore-deleted-dialog-title"
          badgeClass="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          icon={<RotateCcw size={18} />}
          title={t("title")}
          subtitle={<DialogSubject name={billName} />}
          onClose={onSkip}
          busy={restoring}
        />
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {t("description", { name: billName })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            disabled={restoring}
            autoFocus
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("skip")}
          </button>
          <button
            onClick={onRestore}
            disabled={restoring}
            className="flex-1 rounded-lg border border-transparent bg-green-700 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-green-800 disabled:opacity-50"
          >
            {restoring ? t("restoring") : t("restore")}
          </button>
        </div>
      </DialogShell>
  );
}
