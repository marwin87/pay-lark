import { apiFetch } from "./api";
import type { BillFrequency } from "./bills-api";
import type { Category } from "./categories-api";

export type { BillFrequency };
export type PaymentStatus = "upcoming" | "overdue" | "paid";

export interface PaymentInstanceOut {
  id: number;
  bill_id: number;
  period: string;
  due_date: string;
  amount: string;
  amount_overridden: boolean;
  status: PaymentStatus;
  paid_at: string | null;
  paid_amount: string | null;
  notes: string | null;
  bill_name: string;
  currency: string;
  frequency: BillFrequency;
  interval: number;
  is_last: boolean;
  category: Category;
  email_sent_at: string | null;
  bill_status: "draft" | "active" | "paused";
}

/** Paid / unpaid totals for one currency in one month (never mixed across currencies). */
export interface TrendPoint {
  period: string;
  currency: string;
  paid: string;
  unpaid: string;
  /** The part of `unpaid` already past its due date. */
  overdue: string;
}

/** Totals for the 12 months ending at `month` ("YYYY-MM"); months without payments are absent. */
export function fetchTrend(month: string): Promise<TrendPoint[]> {
  return apiFetch<TrendPoint[]>(`/bills/payments/trend?month=${encodeURIComponent(month)}`);
}

export function syncInstances(month: string): Promise<void> {
  return apiFetch<void>(`/bills/sync-instances?month=${encodeURIComponent(month)}`, {
    method: "POST",
  });
}

export function fetchPayments(month: string): Promise<PaymentInstanceOut[]> {
  return apiFetch<PaymentInstanceOut[]>(
    `/bills/payments?month=${encodeURIComponent(month)}`,
  );
}

export function markPaid(
  instanceId: number,
  paidAmount: string | null,
  notes?: string,
  paidAt?: string, // "YYYY-MM-DD"; omitted defaults to today server-side
): Promise<PaymentInstanceOut> {
  const amount = paidAmount ? parseFloat(paidAmount) : null;
  return apiFetch<PaymentInstanceOut>(`/bills/payments/${instanceId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      paid_amount: amount,
      notes: notes ?? null,
      paid_at: paidAt ?? null,
    }),
  });
}

/** Edit one payment. Paid: paid_amount/paid_at/notes. Unpaid: amount/notes/due_date
 *  (amount applies to this payment only; null → follow the bill's amount). */
export function updatePayment(
  instanceId: number,
  fields: {
    amount?: number | null;
    paid_amount?: number | null;
    paid_at?: string; // "YYYY-MM-DD"
    notes?: string;
    due_date?: string; // "YYYY-MM-DD"
  },
): Promise<PaymentInstanceOut> {
  return apiFetch<PaymentInstanceOut>(`/bills/payments/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export function deletePayment(instanceId: number, deleteFuture = false): Promise<void> {
  const url = `/bills/payments/${instanceId}${deleteFuture ? "?delete_future=true" : ""}`;
  return apiFetch<void>(url, { method: "DELETE" });
}

export function revertPay(instanceId: number): Promise<PaymentInstanceOut> {
  return apiFetch<PaymentInstanceOut>(`/bills/payments/${instanceId}/unpay`, {
    method: "POST",
  });
}
