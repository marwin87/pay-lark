"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared popup shell: portal, backdrop, Escape and backdrop-click to close.
 * Bottom sheet below `sm`, centered card from `sm` up. Set `busy` while an
 * action runs so it can't be dismissed mid-flight.
 */
export default function DialogShell({
  labelledBy,
  onClose,
  busy = false,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 backdrop-blur-sm sm:[align-items:safe_center] sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
        className="w-full max-w-sm rounded-t-2xl border border-slate-200 bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-6 dark:bg-slate-800 dark:border-slate-700"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
