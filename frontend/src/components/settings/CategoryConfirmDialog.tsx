"use client";

import { Archive, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";
import DialogSubject from "@/components/ui/DialogSubject";

interface Props {
  mode: "delete" | "archive";
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function CategoryConfirmDialog({ mode, name, onConfirm, onCancel, busy = false }: Props) {
  const t = useTranslations("CategoryConfirmDialog");
  const isDelete = mode === "delete";
  return (
    <DialogShell labelledBy="category-confirm-dialog-title" onClose={onCancel} busy={busy}>
      <DialogHeader
        id="category-confirm-dialog-title"
        badgeClass={
          isDelete
            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        }
        icon={isDelete ? <Trash2 size={18} /> : <Archive size={18} />}
        title={t(`${mode}Title`)}
        subtitle={<DialogSubject name={name} />}
        onClose={onCancel}
      />
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{t(`${mode}Description`)}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={busy}
          autoFocus
          className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          {t("cancel")}
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 rounded-lg border border-transparent py-2.5 text-sm font-medium text-white shadow-sm transition-all disabled:opacity-50 ${
            isDelete ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {t(`${mode}Confirm`)}
        </button>
      </div>
    </DialogShell>
  );
}
