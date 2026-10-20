"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SearchInput from "@/components/SearchInput";
import { resetOnboarding } from "@/components/help/OnboardingChecklist";

const SECTIONS = [
  { key: "bills", items: ["addBill", "draft", "repeat", "editBill", "pause", "resume"] },
  { key: "payments", items: ["dashboard", "seePayments", "statusColors", "filters", "markPaid", "editPayment", "revert", "deletePayment", "export", "share"] },
  { key: "settings", items: ["reminders", "backup", "restore", "categories", "language", "account", "install"] },
] as const;

const MAX_STEPS = 4;

// Lowercase, no accents ("płatność" ~ "platnosc"), so typing without diacritics still finds it.
const fold = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");

/** FAQ in plain words: search, grouped questions and the "show start steps" link. */
export default function HelpContent({ scroll = false, onDone }: { scroll?: boolean; onDone?: () => void }) {
  const t = useTranslations("Help");
  const [query, setQuery] = useState("");
  const router = useRouter();
  const tLayout = useTranslations("DashboardLayout");
  const tBills = useTranslations("BillsPage");
  const tRow = useTranslations("BillTemplateRow");
  const tPay = useTranslations("PaymentRow");
  const tPayments = useTranslations("PaymentsPage");
  const tNav = useTranslations("Dashboard.nav");
  const tFilters = useTranslations("Filters");
  const tSettings = useTranslations("SettingsPage");

  // The app's own button and tab names, so the answers always match what is on screen.
  const labels = {
    bills: tLayout("bills"),
    payments: tLayout("payments"),
    settings: tLayout("settings"),
    newBill: tBills("newBill"),
    showPaused: tBills("showPaused"),
    edit: tRow("edit"),
    draft: tRow("draft"),
    generatePayments: tRow("generatePayments"),
    pause: tRow("pause"),
    delete: tRow("delete"),
    resume: tRow("resume"),
    markPaid: tPay("markAsPaid"),
    revert: tPay("revert"),
    editPayment: tPay("edit"),
    deletePayment: tPay("delete"),
    share: tPayments("shareMonth"),
    calendar: tPayments("calendarTitle"),
    today: tNav("today"),
    search: tFilters("toolbarTitle"),
    tabAccount: tSettings("tabs.account"),
    tabPreferences: tSettings("tabs.preferences"),
    tabNotifications: tSettings("tabs.notifications"),
    tabCategories: tSettings("tabs.categories"),
    tabReports: tSettings("tabs.reports"),
    tabBackup: tSettings("tabs.data"),
    backup: tSettings("backup.button"),
    restore: tSettings("restore.button"),
  };
  const rich = (key: string) =>
    t.rich(key, { ...labels, b: (c: ReactNode) => <b className="font-semibold text-slate-700 dark:text-slate-200">{c}</b> });

  const stepKeys = (id: string) =>
    Array.from({ length: MAX_STEPS }, (_, n) => `items.${id}.s${n + 1}`).filter((key) => t.has(key));
  // Question + answer as plain text (labels filled in, tags dropped) for searching.
  const plain = (key: string) =>
    String(t.raw(key))
      .replace(/\{(\w+)\}/g, (_, name: string) => labels[name as keyof typeof labels] ?? "")
      .replace(/<\/?b>/g, "");
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (id: string) => {
    const text = fold([plain(`items.${id}.q`), ...stepKeys(id).map(plain)].join(" "));
    return words.every((w) => text.includes(w));
  };
  const sections = SECTIONS.map((sec) => ({ ...sec, items: sec.items.filter(matches) })).filter((sec) => sec.items.length > 0);

  function answer(id: string) {
    const steps = stepKeys(id).map(rich);
    if (steps.length === 1) return <p>{steps[0]}</p>;
    return (
      <ol className="list-decimal space-y-1.5 pl-5">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    );
  }

  return (
    <>
      <div className="px-5 pb-3 sm:[&>div]:w-full">
        <SearchInput value={query} onChange={setQuery} placeholder={t("searchPlaceholder")} />
      </div>
      <div className={`px-5 pb-2 ${scroll ? "min-h-0 overflow-y-auto" : ""}`}>
        {sections.length === 0 && (
          <p role="status" className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("noResults")}
          </p>
        )}
        {sections.map((section) => (
          <section key={section.key} className="mb-4">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t(section.key)}
            </h3>
            {section.items.map((id) => (
              <details key={id} open={words.length > 0 || undefined} className="group border-b border-slate-100 last:border-0 dark:border-slate-700/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-slate-700 marker:content-none dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  {t(`items.${id}.q`)}
                  <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500" aria-hidden>
                    ▾
                  </span>
                </summary>
                <div className="pb-3 text-sm text-slate-500 dark:text-slate-400">{answer(id)}</div>
              </details>
            ))}
          </section>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-700/60">
        <button
          type="button"
          onClick={async () => {
            await resetOnboarding();
            onDone?.();
            router.push("/dashboard");
          }}
          className="text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
        >
          {t("restart")}
        </button>
      </div>
    </>
  );
}
