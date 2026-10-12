"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { revertPay, type PaymentInstanceOut } from "@/lib/payments-api";
import DialogHeader from "@/components/ui/DialogHeader";
import PaymentSubject from "./PaymentSubject";
import DialogShell from "@/components/ui/DialogShell";

interface Props {
  instance: PaymentInstanceOut;
  isOpen: boolean;
  onClose: () => void;
  onReverted: (updated: PaymentInstanceOut) => void;
}

export default function RevertPaymentDialog({
  instance,
  isOpen,
  onClose,
  onReverted,
}: Props) {
  const t = useTranslations("RevertPaymentDialog");
  const [isReverting, setIsReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Re-arm on mount: React strict mode (dev) runs mount, cleanup, mount, and a
  // cleanup-only effect would leave the ref false, so results would be dropped.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsReverting(true);
    setError(null);
    try {
      const updated = await revertPay(instance.id);
      if (mounted.current) onReverted(updated);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : t("revertFailed"));
      setIsReverting(false);
    }
  }

  return (
    <DialogShell labelledBy="revert-payment-dialog-title" onClose={onClose} busy={isReverting}>
        <DialogHeader
          id="revert-payment-dialog-title"
          badgeClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          icon={<Undo2 size={18} />}
          title={t("title")}
          subtitle={<PaymentSubject instance={instance} />}
          onClose={onClose}
          busy={isReverting}
        />

        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            autoFocus
            disabled={isReverting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isReverting}
            className="flex-1 rounded-lg border border-transparent bg-amber-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-amber-700 disabled:opacity-50"
          >
            {isReverting ? t("reverting") : t("confirm")}
          </button>
        </div>
      </DialogShell>
  );
}
