"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  EXPORT_FIELD_KEYS,
  MANDATORY_EXPORT_FIELDS,
  updateMe,
  type ExportFieldKey,
  type UserProfile,
} from "@/lib/user-api";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tile } from "./Tile";
import { useToast } from "@/context/toast-context";

export function ExportSettingsTile({
  format = "excel",
  profile,
  onProfileUpdate,
  t,
  isCollapsed,
  onToggle,
}: {
  format?: "excel" | "pdf";
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const showToast = useToast();
  const isPdf = format === "pdf";
  const enabledKey = isPdf ? "pdf_enabled" : "export_enabled";
  const fieldsKey = isPdf ? "pdf_fields" : "export_fields";
  const ns = isPdf ? "pdfExport" : "excelExport";
  const [enabled, setEnabled] = useState(profile[enabledKey]);
  const [fields, setFields] = useState<ExportFieldKey[]>(profile[fieldsKey]);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [savingField, setSavingField] = useState<ExportFieldKey | null>(null);

  async function toggleEnabled(value: boolean) {
    setEnabled(value);
    setIsTogglingEnabled(true);
    try {
      onProfileUpdate(await updateMe({ [enabledKey]: value }));
      showToast(tp("settingsSaved"));
    } catch {
      setEnabled(!value);
    } finally {
      setIsTogglingEnabled(false);
    }
  }

  async function toggleField(key: ExportFieldKey, checked: boolean) {
    const previous = fields;
    const next = checked ? [...fields, key] : fields.filter((f) => f !== key);
    setFields(next);
    setSavingField(key);
    try {
      onProfileUpdate(await updateMe({ [fieldsKey]: next }));
      showToast(tp("settingsSaved"));
    } catch {
      setFields(previous);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <Tile
      color="teal"
      icon={isPdf ? FileText : FileSpreadsheet}
      title={tp(`${ns}.title`)}
      description={tp(`${ns}.description`)}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <Switch
        checked={enabled}
        onChange={toggleEnabled}
        label={tp(`${ns}.toggleLabel`)}
        disabled={isTogglingEnabled}
      />

      <fieldset disabled={!enabled} className={!enabled ? "opacity-50" : ""}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {tp("excelExport.fieldsHeading")}
        </p>
        <div className="space-y-2">
          {EXPORT_FIELD_KEYS.map((key) => {
            const mandatory = MANDATORY_EXPORT_FIELDS.includes(key);
            return (
              <Checkbox
                key={key}
                checked={fields.includes(key)}
                onChange={(checked) => toggleField(key, checked)}
                disabled={mandatory || savingField === key}
                label={
                  mandatory
                    ? `${tp(`excelExport.fields.${key}`)} ${tp("excelExport.requiredSuffix")}`
                    : tp(`excelExport.fields.${key}`)
                }
              />
            );
          })}
        </div>
      </fieldset>
    </Tile>
  );
}
