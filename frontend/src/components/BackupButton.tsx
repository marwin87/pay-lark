"use client";

import { useState } from "react";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BACKUP_SECTIONS, BackupSection, downloadBackup } from "@/lib/export-api";
import { Checkbox } from "@/components/ui/Checkbox";
import DialogHeader from "@/components/ui/DialogHeader";
import DialogShell from "@/components/ui/DialogShell";

type State = "idle" | "confirming" | "downloading" | "warning" | "error";

// Grouped under the same tab names as the Settings page, so the sections read as
// "the same data you'd find under Settings > Preferences" etc. "bills" has no
// settings-tab home of its own (it's the app's core content, not a preference) —
// it groups under "data", the tab this Backup button itself lives on.
const SECTION_GROUPS: {
  tabKey: "data" | "preferences" | "notifications" | "categories" | "reports";
  sections: BackupSection[];
}[] = [
  { tabKey: "data", sections: ["bills"] },
  { tabKey: "preferences", sections: ["currency", "languages"] },
  { tabKey: "notifications", sections: ["email", "telegram"] },
  { tabKey: "categories", sections: ["categories"] },
  { tabKey: "reports", sections: ["export", "pdf", "share"] },
];

export default function BackupButton({ label }: { label?: string } = {}) {
  const t = useTranslations("BackupButton");
  const tSettings = useTranslations("SettingsPage");
  const [state, setState] = useState<State>("idle");
  const [selected, setSelected] = useState<Set<BackupSection>>(
    () => new Set(BACKUP_SECTIONS)
  );
  const allSelected = selected.size === BACKUP_SECTIONS.length;

  function toggle(section: BackupSection) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  }

  async function handleConfirm() {
    setState("downloading");
    try {
      const { telegramTokenUnreadable } = await downloadBackup(
        BACKUP_SECTIONS.filter((s) => selected.has(s))
      );
      setState(telegramTokenUnreadable ? "warning" : "idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setState("confirming")}
        aria-label={t("ariaLabel")}
        className={
          label
            ? "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            : "rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
        }
      >
        <HardDriveDownload size={18} />
        {label && <span>{label}</span>}
      </button>

      {(state === "confirming" ||
        state === "downloading" ||
        state === "warning" ||
        state === "error") &&
        (<DialogShell labelledBy="backup-dialog-title" onClose={() => setState("idle")} busy={state === "downloading"}>
              <DialogHeader
                id="backup-dialog-title"
                badgeClass="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                icon={<HardDriveDownload size={18} />}
                title={t("dialogTitle")}
                onClose={() => setState("idle")}
                busy={state === "downloading"}
              />
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription")}
              </p>
              {state !== "warning" && (
                <fieldset className="mb-6 space-y-4" disabled={state === "downloading"}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(BACKUP_SECTIONS))
                    }
                    className="text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
                  >
                    {allSelected ? t("deselectAll") : t("selectAll")}
                  </button>
                  {SECTION_GROUPS.map(({ tabKey, sections }) => (
                    <div key={tabKey}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {tSettings(`tabs.${tabKey}`)}
                      </p>
                      <div className="space-y-2">
                        {sections.map((section) => (
                          <Checkbox
                            key={section}
                            checked={selected.has(section)}
                            onChange={() => toggle(section)}
                            label={t(`sections.${section}`)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
              )}
              {state === "warning" ? (
                <>
                  <p className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    {t("telegramWarning")}
                  </p>
                  <button
                    onClick={() => setState("idle")}
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {t("ok")}
                  </button>
                </>
              ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => setState("idle")}
                  disabled={state === "downloading"}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === "downloading" || selected.size === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-transparent bg-green-700 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-green-800 disabled:opacity-50"
                >
                  {state === "downloading" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t("downloading")}
                    </>
                  ) : (
                    t("confirm")
                  )}
                </button>
              </div>
              )}
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
