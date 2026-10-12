"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { getLastSnapshot, restoreFromSnapshot } from "@/lib/export-api";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";

type State = "idle" | "confirming" | "restoring" | "error";

export default function SnapshotRecoverySection() {
  const t = useTranslations("SnapshotRecoverySection");
  const locale = useLocale();
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    getLastSnapshot()
      .then((snapshot) => setCreatedAt(snapshot?.created_at ?? null))
      .catch(() => {});
  }, []);

  if (!createdAt) return null;

  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));

  async function handleConfirm() {
    setState("restoring");
    try {
      await restoreFromSnapshot();
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <hr className="my-4 border-slate-200 dark:border-slate-700" />
      <div className="flex items-start gap-3 text-sm">
        <History
          size={18}
          className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500"
        />
        <div className="flex-1">
          <p className="text-slate-600 dark:text-slate-300">
            {t("message", { date: dateLabel })}
          </p>
          <button
            onClick={() => setState("confirming")}
            className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            {t("restoreButton")}
          </button>
        </div>
      </div>

      {(state === "confirming" || state === "restoring" || state === "error") &&
        (<DialogShell labelledBy="snapshot-restore-dialog-title" onClose={() => setState("idle")} busy={state === "restoring"}>
              <DialogHeader
                id="snapshot-restore-dialog-title"
                badgeClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                icon={<History size={18} />}
                title={t("dialogTitle")}
                onClose={() => setState("idle")}
                busy={state === "restoring"}
              />
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setState("idle")}
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
                  {t("error")}
                </p>
              )}
            </DialogShell>
        )}
    </>
  );
}
