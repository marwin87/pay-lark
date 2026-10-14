import { apiFetch } from "./api";
import type { Category } from "./categories-api";

export type BillFrequency = "monthly" | "annual" | "one_off";

export interface BillTemplateOut {
  id: number;
  name: string;
  category: Category;
  frequency: BillFrequency;
  interval: number;
  amount: string;
  currency: string;
  due_day: number | null;
  /** Several payment days per cycle; null = just due_day. */
  due_days: number[] | null;
  due_month: number | null;
  /** One-off bills: their payment dates, and which of them are already paid. */
  dates: string[];
  paid_dates: string[];
  start_period: string | null;
  end_period: string | null;
  notes: string | null;
  is_archived: boolean;
  /** false = draft: no payments exist until activateBill. */
  is_activated: boolean;
  created_at: string;
}

export interface BillTemplateCreate {
  name: string;
  category_id: number;
  frequency: BillFrequency;
  interval?: number;
  amount: string;
  currency?: string;
  due_day?: number | null;
  due_days?: number[] | null;
  /** One-off only: every payment date (YYYY-MM-DD), any months. */
  dates?: string[] | null;
  due_month?: number | null;
  end_period?: string | null;
  notes?: string | null;
}

export type BillTemplateUpdate = Partial<BillTemplateCreate> & {
  recreate_deleted_future?: boolean;
};

export function fetchBills(includeArchived = false): Promise<BillTemplateOut[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return apiFetch<BillTemplateOut[]>(`/bills${qs}`);
}

export function createBill(data: BillTemplateCreate): Promise<BillTemplateOut> {
  return apiFetch<BillTemplateOut>("/bills", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateBill(
  id: number,
  data: BillTemplateUpdate,
): Promise<BillTemplateOut> {
  return apiFetch<BillTemplateOut>(`/bills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function activateBill(id: number): Promise<BillTemplateOut> {
  return apiFetch<BillTemplateOut>(`/bills/${id}/activate`, { method: "POST" });
}

export function archiveBill(id: number): Promise<void> {
  return apiFetch<void>(`/bills/${id}/archive`, { method: "POST" });
}

export function unarchiveBill(id: number): Promise<void> {
  return apiFetch<void>(`/bills/${id}/unarchive`, { method: "POST" });
}

export function hasDeletedFuture(id: number): Promise<{ has_deleted_future: boolean }> {
  return apiFetch<{ has_deleted_future: boolean }>(`/bills/${id}/has-deleted-future`);
}
