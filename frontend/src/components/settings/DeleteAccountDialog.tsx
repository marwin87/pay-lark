"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PasswordInput } from "@/components/ui/PasswordInput";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-red-600 dark:focus:ring-red-900/40";

interface Props {
  onConfirm: (password: string) => void;
  onCancel: () => void;
  deleting?: boolean;
  error?: string | null;
}

export default function DeleteAccountDialog({
  onConfirm,
  onCancel,
  deleting = false,
  error = null,
}: Props) {
  const t = useTranslations("DeleteAccountDialog");
  const [password, setPassword] = useState("");
  const canConfirm = password.length > 0 && !deleting;
  return (
    <DialogShell labelledBy="delete-account-dialog-title" onClose={onCancel} busy={deleting}>
        <DialogHeader
          id="delete-account-dialog-title"
          badgeClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          icon={<Trash2 size={18} />}
          title={t("title")}
          onClose={onCancel}
          busy={deleting}
        />
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("passwordLabel")}
        </label>
        <div className="mb-4">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canConfirm && onConfirm(password)}
            placeholder={t("passwordPlaceholder")}
            autoComplete="current-password"
            disabled={deleting}
            className={inputClass}
          />
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            autoFocus
            disabled={deleting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={!canConfirm}
            className="flex-1 rounded-lg border border-transparent bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? t("deleting") : t("confirm")}
          </button>
        </div>
      </DialogShell>
  );
}
