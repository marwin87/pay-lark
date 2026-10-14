"use client";

import { Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";
import DialogSubject from "@/components/ui/DialogSubject";

interface Props {
  billName: string;
  onConfirm: () => void;
  onCancel: () => void;
  activating?: boolean;
}

export default function ActivateConfirmDialog({ billName, onConfirm, onCancel, activating = false }: Props) {
  const t = useTranslations("ActivateConfirmDialog");
  return (
    <DialogShell labelledBy="activate-dialog-title" onClose={onCancel} busy={activating}>
      <DialogHeader
        id="activate-dialog-title"
        badgeClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        icon={<Rocket size={18} />}
        title={t("title")}
        subtitle={<DialogSubject name={billName} />}
        onClose={onCancel}
        busy={activating}
      />
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{t("description")}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          autoFocus
          disabled={activating}
          className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          {t("cancel")}
        </button>
        <button
          onClick={onConfirm}
          disabled={activating}
          className="flex-1 rounded-lg border border-transparent bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
        >
          {activating ? t("activating") : t("confirm")}
        </button>
      </div>
    </DialogShell>
  );
}
