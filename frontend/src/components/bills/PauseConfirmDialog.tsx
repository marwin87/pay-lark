"use client";

import { Pause } from "lucide-react";
import { useTranslations } from "next-intl";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";
import DialogSubject from "@/components/ui/DialogSubject";

interface Props {
  billName: string;
  onConfirm: () => void;
  onCancel: () => void;
  pausing?: boolean;
}

export default function PauseConfirmDialog({ billName, onConfirm, onCancel, pausing = false }: Props) {
  const t = useTranslations("PauseConfirmDialog");
  return (
    <DialogShell labelledBy="pause-dialog-title" onClose={onCancel}>
        <DialogHeader
          id="pause-dialog-title"
          badgeClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          icon={<Pause size={18} />}
          title={t("title")}
          subtitle={<DialogSubject name={billName} />}
          onClose={onCancel}
        />
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            autoFocus
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={pausing}
            className="flex-1 rounded-lg border border-transparent bg-amber-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-amber-700 disabled:opacity-50"
          >
            {pausing ? t("pausing") : t("pause")}
          </button>
        </div>
      </DialogShell>
  );
}
