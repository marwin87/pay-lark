"use client";

import { useRef, useState } from "react";
import { HardDriveUpload, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { getExportSummary, restoreFromBackup } from "@/lib/export-api";
import { flashToastAfterReload } from "@/context/toast-context";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";

type State = "idle" | "confirming" | "restoring" | "error";

type Counts = { bills?: number; payments?: number; categories?: number };

export default function RestoreButton({ label }: { label?: string } = {}) {
  const t = useTranslations("RestoreButton");
  const locale = useLocale();
  const [state, setState] = useState<State>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [backupCounts, setBackupCounts] = useState<Counts | null>(null);
  const [backupExportedAt, setBackupExportedAt] = useState<string | null>(null);
  const [currentCounts, setCurrentCounts] = useState<{ bills: number; payments: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportDateLabel = (() => {
    if (!backupExportedAt) return t("exportDateUnknown");
    const d = new Date(backupExportedAt);
    return isNaN(d.getTime())
      ? t("exportDateUnknown")
      : new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(d);
  })();

  const isStale =
    currentCounts !== null &&
    backupCounts?.bills !== undefined &&
    backupCounts.payments !== undefined &&
    (backupCounts.bills < currentCounts.bills ||
      backupCounts.payments < currentCounts.payments);

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t("fileTooLarge"));
      setState("error");
      return;
    }

    let parsed: {
      bill_templates?: unknown;
      payment_instances?: unknown;
      categories?: unknown;
      notifications?: unknown;
      telegram?: unknown;
      preferences?: unknown;
      exported_at?: unknown;
    };
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrorMsg(t("invalidFile"));
      setState("error");
      return;
    }
    const hasBills =
      Array.isArray(parsed.bill_templates) && Array.isArray(parsed.payment_instances);
    const hasAnySection =
      hasBills ||
      Array.isArray(parsed.categories) ||
      [parsed.notifications, parsed.telegram, parsed.preferences].some(
        (v) => typeof v === "object" && v !== null
      );
    if (!parsed || typeof parsed !== "object" || !hasAnySection) {
      setErrorMsg(t("invalidFile"));
      setState("error");
      return;
    }

    setSelectedFile(file);
    setBackupCounts({
      bills: hasBills ? (parsed.bill_templates as unknown[]).length : undefined,
      payments: hasBills ? (parsed.payment_instances as unknown[]).length : undefined,
      categories: Array.isArray(parsed.categories) ? parsed.categories.length : undefined,
    });
    setBackupExportedAt(
      typeof parsed.exported_at === "string" ? parsed.exported_at : null
    );
    try {
      const summary = await getExportSummary();
      setCurrentCounts({ bills: summary.bill_count, payments: summary.payment_count });
    } catch {
      setCurrentCounts(null);
    }
    setState("confirming");
  }

  function handleCancel() {
    setState("idle");
    setSelectedFile(null);
    setErrorMsg("");
    setBackupCounts(null);
    setBackupExportedAt(null);
    setCurrentCounts(null);
  }

  async function handleConfirm() {
    if (!selectedFile) return;
    setState("restoring");
    try {
      await restoreFromBackup(selectedFile);
      setState("idle");
      setSelectedFile(null);
      setBackupCounts(null);
      setBackupExportedAt(null);
      setCurrentCounts(null);
      // Reload page so dashboard reflects restored data; the toast is shown after it.
      flashToastAfterReload(t("done"));
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".bak,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={handleButtonClick}
        aria-label={t("ariaLabel")}
        className={
          label
            ? "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            : "rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
        }
      >
        <HardDriveUpload size={18} />
        {label && <span>{label}</span>}
      </button>

      {(state === "confirming" || state === "restoring" || state === "error") &&
        (<DialogShell labelledBy="restore-dialog-title" onClose={handleCancel} busy={state === "restoring"}>
              <DialogHeader
                id="restore-dialog-title"
                badgeClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                icon={<HardDriveUpload size={18} />}
                title={t("dialogTitle")}
                onClose={handleCancel}
                busy={state === "restoring"}
              />
              {backupCounts && (
                <div className="mb-4 space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
                  {backupCounts.bills !== undefined && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t("currentLabel")}</span>
                    <span>
                      {currentCounts
                        ? t("countsSummary", {
                            bills: currentCounts.bills,
                            payments: currentCounts.payments,
                          })
                        : t("countsUnavailable")}
                    </span>
                  </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t("backupLabel")}</span>
                    <span>
                      {backupCounts.bills !== undefined
                        ? t("countsSummary", {
                            bills: backupCounts.bills,
                            payments: backupCounts.payments ?? 0,
                          })
                        : t("noBillsInFile")}
                      {backupCounts.categories != null &&
                        ` · ${t("categoriesCount", { categories: backupCounts.categories })}`}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {exportDateLabel}
                  </div>
                </div>
              )}
              {isStale && (
                <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  {t("staleDataWarning")}
                </p>
              )}
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription", { filename: selectedFile?.name ?? "" })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  onKeyDown={(e) => e.key === "Escape" && handleCancel()}
                  disabled={state === "restoring"}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === "restoring"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-transparent bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
                >
                  {state === "restoring" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t("restoring")}
                    </>
                  ) : (
                    t("confirm")
                  )}
                </button>
              </div>
              {state === "error" && (
                <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
                  {errorMsg || t("error")}
                </p>
              )}
            </DialogShell>
        )}
    </>
  );
}
