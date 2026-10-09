"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { usePopupPosition } from "@/components/ui/usePopupPosition";

interface Props {
  id?: string;
  label: ReactNode;
  /** Greys the trigger out and keeps the popup shut (read-only value). */
  disabled?: boolean;
  /** Runs on every open/close click, e.g. to reset the viewed month to the selection. */
  onToggle?: () => void;
  /** Rendered next to the trigger inside the positioned wrapper (e.g. a clear button). */
  trailing?: ReactNode;
  children: (close: () => void) => ReactNode;
}

/** Trigger button + portaled popup (outside click, Escape, viewport anchoring) for every picker. */
export default function CalendarPopup({ id, label, disabled, onToggle, trailing, children }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  usePopupPosition({ open, triggerRef, popupRef, onClose: () => setOpen(false) });

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!popupRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { onToggle?.(); setOpen((o) => !o); }}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors hover:border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:border-green-600 dark:focus:border-green-600 dark:focus:ring-green-900/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 dark:disabled:hover:border-slate-600"
      >
        <CalendarDays size={15} className="shrink-0 text-slate-400 dark:text-slate-500" />
        <span className="capitalize">{label}</span>
      </button>
      {trailing}
      {open && createPortal(
        <div ref={popupRef} className="fixed w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {children(close)}
        </div>,
        document.body,
      )}
    </div>
  );
}
