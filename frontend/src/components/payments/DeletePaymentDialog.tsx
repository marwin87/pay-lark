"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deletePayment, type PaymentInstanceOut } from "@/lib/payments-api";
import { Checkbox } from "@/components/ui/Checkbox";
import DialogHeader from "@/components/ui/DialogHeader";
import PaymentSubject from "./PaymentSubject";
import DialogShell from "@/components/ui/DialogShell";

interface Props {
  instance: PaymentInstanceOut;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

export default function DeletePaymentDialog({
  instance,
  isOpen,
  onClose,
  onDeleted,
}: Props) {
  const t = useTranslations("DeletePaymentDialog");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFuture, setDeleteFuture] = useState(false);
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

  const isRecurring = instance.frequency !== "one_off";

  async function handleConfirm() {
    setIsDeleting(true);
    setError(null);
    try {
      await deletePayment(instance.id, deleteFuture);
      if (mounted.current) onDeleted(instance.id);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : t("deleteFailed"));
      setIsDeleting(false);
    }
  }

  return (
    <DialogShell labelledBy="delete-payment-dialog-title" onClose={onClose} busy={isDeleting}>
        <DialogHeader
          id="delete-payment-dialog-title"
          badgeClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          icon={<Trash2 size={18} />}
          title={t("title")}
          subtitle={<PaymentSubject instance={instance} />}
          onClose={onClose}
          busy={isDeleting}
        />

        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          {isRecurring
            ? t("descriptionRecurring")
            : t("descriptionOneOff")}
        </p>

        {isRecurring && (
          <div className="mb-5">
            <Checkbox
              checked={deleteFuture}
              onChange={setDeleteFuture}
              disabled={isDeleting}
              color="red"
              align="start"
              label={t("deleteFutureLabel")}
            />
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            autoFocus
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-transparent bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? t("deleting") : t("confirm")}
          </button>
        </div>
      </DialogShell>
  );
}
