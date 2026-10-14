"use client";

import { useCallback, useState } from "react";
import { COLLAPSED_CATEGORIES_KEYS } from "./useCollapsedCategories";

// Search / filter / sort state of the Payments and Bills lists, and the Dashboard currency. It survives
// navigating between pages (and a reload) while signed in, and is wiped on
// login, logout and session expiry so every sign-in starts from the defaults.
export const VIEW_STATE_KEYS = {
  paymentsSearch: "payments-search",
  paymentsStatus: "payments-status",
  paymentsCategories: "payments-categories",
  paymentsSort: "payments-sort",
  billsSearch: "bills-search",
  billsCategories: "bills-categories",
  billsSort: "bills-sort",
  billsShowPaused: "bills-show-paused",
  dashboardCurrency: "dashboard-currency",
} as const;

export function clearViewState(): void {
  const keys = [...Object.values(VIEW_STATE_KEYS), ...Object.values(COLLAPSED_CATEGORIES_KEYS)];
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key); // sort / collapse state used to live here
    } catch {
      // ignore storage errors (e.g. private browsing quota)
    }
  }
}

/** useState backed by sessionStorage. `parse` returns undefined for a missing/invalid stored value. */
export function useSessionState<T>(
  key: string,
  fallback: T,
  parse: (stored: unknown) => T | undefined,
  toJson: (value: T) => unknown = (v) => v,
) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) return parse(JSON.parse(raw)) ?? fallback;
    } catch {
      // ignore malformed storage
    }
    return fallback;
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(toJson(next)));
      } catch {
        // ignore storage errors
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set] as const;
}

export function useSessionString(key: string) {
  return useSessionState<string>(key, "", (v) => (typeof v === "string" ? v : undefined));
}

export function useSessionSet(key: string) {
  return useSessionState<Set<string>>(
    key,
    new Set(),
    (v) => (Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === "string")) : undefined),
    (s) => [...s],
  );
}

export function useSessionBoolean(key: string) {
  return useSessionState<boolean>(key, false, (v) => (typeof v === "boolean" ? v : undefined));
}
