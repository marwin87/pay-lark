"use client";

import { useSessionState } from "./useSessionState";

export function useSortOption<T extends string>(
  storageKey: string,
  fallback: T,
  valid: readonly T[],
) {
  return useSessionState<T>(storageKey, fallback, (v) =>
    typeof v === "string" && (valid as readonly string[]).includes(v) ? (v as T) : undefined,
  );
}
