"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchBills } from "@/lib/bills-api";
import { fetchTrend } from "@/lib/payments-api";
import { fetchMe } from "@/lib/user-api";

// Per account: a shared key hid the card for every new account created in a browser where
// someone had once pressed "Hide".
const HIDDEN_KEY = "onboarding-hidden";
const RESET_EVENT = "onboarding-reset";
const keyFor = (email: string) => `${HIDDEN_KEY}:${email}`;

/** Brings the start steps back (from the help sheet), even when every step is already done. */
export async function resetOnboarding() {
  try {
    const me = await fetchMe();
    localStorage.setItem(keyFor(me.email), "0");
  } catch {
    // storage blocked or offline: the card simply stays as it is
  }
  window.dispatchEvent(new Event(RESET_EVENT));
}

// "1" = hidden, "0" = shown on request (even if complete), unset = automatic
function stored(email: string): string | null {
  try {
    return localStorage.getItem(keyFor(email));
  } catch {
    return null;
  }
}

const CTA_CLASS =
  "shrink-0 rounded-lg border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:border-green-800 hover:bg-green-800";

/**
 * "Get started in 3 steps" card for a fresh account. Every step is read from the
 * account's data, so nothing extra is stored; the card goes away once all are done.
 */
export default function OnboardingChecklist({ currentMonth }: { currentMonth: string }) {
  const t = useTranslations("Help.checklist");
  const tRow = useTranslations("PaymentRow");
  const [done, setDone] = useState<[boolean, boolean, boolean] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pref, setPref] = useState<string | null>("1");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchBills(true), fetchTrend(currentMonth), fetchMe()])
      .then(([bills, trend, me]) => {
        if (cancelled) return;
        setEmail(me.email);
        setDone([
          bills.length > 0,
          trend.some((p) => Number(p.paid) > 0),
          me.email_reminders_enabled || me.telegram_reminders_enabled || me.browser_notifications_enabled,
        ]);
      })
      .catch(() => {}); // no card is better than a broken one
    return () => {
      cancelled = true;
    };
  }, [currentMonth]);

  useEffect(() => {
    if (!email) return;
    const sync = () => setPref(stored(email));
    sync();
    window.addEventListener(RESET_EVENT, sync);
    return () => window.removeEventListener(RESET_EVENT, sync);
  }, [email]);

  if (!done || pref === "1" || (pref !== "0" && done.every(Boolean))) return null;

  const count = done.filter(Boolean).length;
  const current = done.indexOf(false);
  const steps: { title: string; desc: ReactNode; cta?: ReactNode }[] = [
    {
      title: t("billT"),
      desc: t("billD"),
      cta: (
        <Link href="/dashboard/bills" className={CTA_CLASS}>
          {t("billCta")}
        </Link>
      ),
    },
    {
      title: t("paidT"),
      desc: t.rich("paidD", { markPaid: tRow("markAsPaid"), b: (c) => <b className="font-semibold">{c}</b> }),
    },
    {
      title: t("remT"),
      desc: t("remD"),
      cta: (
        <Link href="/dashboard/settings?tab=notifications" className={CTA_CLASS}>
          {t("remCta")}
        </Link>
      ),
    },
  ];

  return (
    <section
      aria-labelledby="onboarding-title"
      className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="onboarding-title" className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => {
            try {
              if (email) localStorage.setItem(keyFor(email), "1");
            } catch {
              // storage blocked: hide for this visit only
            }
            setPref("1");
          }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
        >
          {t("hide")}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("progress", { done: count, total: 3 })}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden>
        <div className="h-full rounded-full bg-green-600 transition-all dark:bg-emerald-500" style={{ width: `${(count / 3) * 100}%` }} />
      </div>
      <ol className="mt-3 flex flex-col gap-1">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 rounded-xl px-2.5 py-2 ${i === current ? "bg-green-50 dark:bg-emerald-900/20" : ""}`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                done[i]
                  ? "border-green-600 bg-green-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                  : i === current
                  ? "border-green-600 text-green-700 dark:border-emerald-500 dark:text-emerald-400"
                  : "border-slate-200 text-slate-400 dark:border-slate-600 dark:text-slate-500"
              }`}
            >
              {done[i] ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${done[i] ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
                {s.title}
              </p>
              {!done[i] && <p className="text-sm text-slate-500 dark:text-slate-400">{s.desc}</p>}
            </div>
            {!done[i] && s.cta}
          </li>
        ))}
      </ol>
    </section>
  );
}
