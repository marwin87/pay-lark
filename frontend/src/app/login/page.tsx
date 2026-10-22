"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail, LockKeyhole, ArrowRight, Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { useNotifications } from "@/hooks/useNotifications";
import { SESSION_EXPIRED_KEY } from "@/lib/auth";
import { validateEmail, validateRequired } from "@/lib/auth-validation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import AuthBrand from "@/components/AuthBrand";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { notifyDueToday } = useNotifications();
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  // Starts null on both server and client render so hydration can't mismatch
  // on it; the real value is read once, after mount, below.
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  useEffect(() => {
    apiFetch<{ configured: boolean }>("/auth/smtp-status")
      .then((data) => setSmtpConfigured(data?.configured ?? false))
      .catch(() => setSmtpConfigured(false));
  }, []);

  // Two independent triggers for this banner: a client-side 401 caught
  // mid-session (flagged via sessionStorage, see auth-context.tsx), or
  // proxy.ts redirecting here server-side because the cookie was already
  // gone before the page ever loaded (flagged via query param, since
  // middleware can't touch sessionStorage). window/sessionStorage only exist
  // on the client, so this has to run after mount rather than in the state
  // initializer — reading them during the render itself is what caused the
  // hydration mismatch this replaces. The setState is deferred into a
  // microtask (a "callback", not the effect body) so it lands as a distinct
  // update rather than a synchronous same-commit one.
  useEffect(() => {
    const hasQueryFlag =
      new URLSearchParams(window.location.search).get("session_expired") === "1";
    const hasStorageFlag = sessionStorage.getItem(SESSION_EXPIRED_KEY) !== null;
    if (!hasQueryFlag && !hasStorageFlag) return;
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    queueMicrotask(() => setError(t("sessionExpired")));
  }, [t]);

  // Strip ?session_expired so a manual refresh of this URL doesn't re-show the banner.
  useEffect(() => {
    if (window.location.search.includes("session_expired")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const emailErr = validateEmail(email, t);
    const passwordErr = validateRequired(password, t);
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setLoading(true);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      login();
      void notifyDueToday();
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? t("tooManyAttempts")
          : t("loginFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#F6FAF8] py-10 dark:bg-slate-900">
      {/* Background decorations — purely decorative, never intercept clicks */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#E7F6EE] opacity-70 blur-3xl dark:bg-emerald-900/20 sm:-right-32 sm:-top-32 sm:h-96 sm:w-96 md:h-[28rem] md:w-[28rem]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 hidden h-96 w-96 rounded-full bg-[#E7F6EE] opacity-70 blur-3xl dark:bg-emerald-900/20 sm:block md:h-[28rem] md:w-[28rem]"
      />

      <div className="relative mx-auto w-full max-w-[760px] px-4 sm:px-6">
        <AuthBrand />

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-[32px] font-bold leading-[1.15] tracking-tight text-[#10231A] dark:text-slate-100 sm:text-[40px]">
            {t("welcomeHeading")}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#64786D] dark:text-slate-400 sm:mt-3 sm:text-base">
            {t("loginSubtitle")}
          </p>
        </div>

        {/* Card */}
        <div className="mx-auto max-w-[664px] rounded-[18px] border border-[#E7EEE9] bg-white px-5 py-6 shadow-[0_10px_30px_rgba(16,35,26,0.06),0_2px_8px_rgba(16,35,26,0.03)] dark:border-slate-700 dark:bg-slate-800 sm:rounded-[20px] sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-base font-semibold text-[#263B31] dark:text-slate-300"
              >
                {t("emailLabel")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                maxLength={254}
                autoComplete="email"
                size="lg"
                icon={Mail}
                placeholder={t("emailPlaceholder")}
                error={emailError ?? undefined}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-base font-semibold text-[#263B31] dark:text-slate-300"
              >
                {t("passwordLabel")}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                size="lg"
                icon={LockKeyhole}
                placeholder={t("passwordPlaceholder")}
                error={passwordError ?? undefined}
              />
            </div>

            <div className="-mt-2 flex justify-end">
              {smtpConfigured ? (
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#079447] transition-colors hover:text-[#067A3A] dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  {t("forgotPassword")}
                  <ArrowRight size={17} strokeWidth={2} />
                </Link>
              ) : (
                <div className="text-right">
                  <span className="text-sm text-slate-400 dark:text-slate-500">
                    {t("forgotPassword")}
                  </span>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {tCommon("smtpNotConfigured")}
                  </p>
                </div>
              )}
            </div>

            <Button type="submit" variant="solid" size="lg" loading={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t("signingIn")}
                </>
              ) : (
                <>
                  {t("signIn")}
                  <ArrowRight size={20} />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Registration prompt — secondary action, deliberately quieter than the card above */}
        <div className="mx-auto mt-8 max-w-[664px] text-center">
          <p className="text-sm text-[#64786D] dark:text-slate-400">{t("noAccount")}</p>
          <Link
            href="/register"
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#079447] transition-colors hover:text-[#067A3A] dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t("register")}
            <ArrowRight size={17} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </main>
  );
}
