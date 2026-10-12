import { apiFetch, BASE_URL, extractApiError } from "./api";
import { browserTimeZone, todayIn } from "@/lib/today";
import { getCsrfToken } from "./auth";
import { BRAND } from "@/lib/brand";

// `telegramTokenUnreadable`: the backup was made without the Telegram token because
// the server can no longer decrypt it (JWT_SECRET changed).
export const BACKUP_SECTIONS = [
  "bills",
  "categories",
  "email",
  "telegram",
  "languages",
  "currency",
  "export",
  "pdf",
  "share",
] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export async function downloadBackup(
  sections: readonly BackupSection[] = BACKUP_SECTIONS
): Promise<{ telegramTokenUnreadable: boolean }> {
  const qs = sections.map((s) => `sections=${s}`).join("&");
  const res = await fetch(`${BASE_URL}/export/json?${qs}`, {
    credentials: "include",
  });

  if (!res.ok) throw await extractApiError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = todayIn(browserTimeZone()); // the local date, not the UTC one
  a.download = `${BRAND.slug}-backup-${today}.bak`;
  a.click();
  URL.revokeObjectURL(url);
  return {
    telegramTokenUnreadable:
      res.headers.get("X-Backup-Warning") === "telegram-token-unreadable",
  };
}

export async function restoreFromBackup(
  file: File
): Promise<{ restored_templates: number; restored_instances: number }> {
  const form = new FormData();
  form.append("file", file);
  const csrfToken = getCsrfToken();
  const res = await fetch(`${BASE_URL}/export/restore`, {
    method: "POST",
    credentials: "include",
    // No Content-Type here on purpose — the browser sets multipart/form-data
    // with the correct boundary itself; apiFetch can't be used since it
    // forces application/json.
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
    body: form,
  });
  if (!res.ok) throw await extractApiError(res);
  return res.json();
}

export async function getExportSummary(): Promise<{
  bill_count: number;
  payment_count: number;
}> {
  return apiFetch("/export/summary");
}

export async function getLastSnapshot(): Promise<{ created_at: string } | null> {
  const res = await fetch(`${BASE_URL}/export/last-snapshot`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await extractApiError(res);
  return res.json();
}

export async function restoreFromSnapshot(): Promise<{
  restored_templates: number;
  restored_instances: number;
}> {
  return apiFetch("/export/restore-snapshot", { method: "POST" });
}

// `month` (1–12) limits the workbook to that one month; omit for the whole year.
async function downloadReport(
  format: "xlsx" | "pdf",
  year: number,
  lang: string,
  month?: number
): Promise<void> {
  const monthQs = month ? `&month=${month}` : "";
  const res = await fetch(`${BASE_URL}/export/${format}?year=${year}&lang=${lang}${monthQs}`, {
    credentials: "include",
  });

  if (!res.ok) throw await extractApiError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = month ? `${year}-${String(month).padStart(2, "0")}` : year;
  a.download = `${BRAND.slug}-${lang}-${suffix}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadXlsx = (year: number, lang: string, month?: number) =>
  downloadReport("xlsx", year, lang, month);

export const downloadPdf = (year: number, lang: string, month?: number) =>
  downloadReport("pdf", year, lang, month);
