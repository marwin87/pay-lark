"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail, LockKeyhole, ArrowRight, Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { passwordTooLong, validateEmail } from "@/lib/auth-validation";
import { browserTimeZone } from "@/lib/today";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import AuthBrand from "@/components/AuthBrand";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const emailErr = validateEmail(email, t);
    const passwordErr =
      password.length < 8
        ? t("passwordTooShort")
        : passwordTooLong(password)
          ? t("passwordTooLong")
          : null;
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        // The browser's zone becomes the account's time zone (editable in Settings)
        body: JSON.stringify({ email, password, timezone: browserTimeZone() }),
      });
      login();
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("emailAlreadyRegistered")
          : err instanceof ApiError && err.status === 429
            ? t("tooManyAttempts")
            : t("registrationFailed"),
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
            {t("registerSubtitle")}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#64786D] dark:text-slate-400 sm:mt-3 sm:text-base">
            {t("registerTagline")}
          </p>
        </div>

        {/* Card */}
        <div className="mx-auto max-w-[664px] rounded-[18px] border border-[#E7EEE9] bg-white px-5 py-6 shadow-[0_10px_30px_rgba(16,35,26,0.06),0_2px_8px_rgba(16,35,26,0.03)] dark:border-slate-700 dark:bg-slate-800 sm:rounded-[20px] sm:p-8">
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
                autoComplete="new-password"
                size="lg"
                icon={LockKeyhole}
                placeholder={t("passwordPlaceholder")}
                error={passwordError ?? undefined}
              />
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("passwordHint")}</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <Button type="submit" variant="solid" size="lg" loading={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t("creatingAccount")}
                </>
              ) : (
                <>
                  {t("createAccount")}
                  <ArrowRight size={20} />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Sign-in prompt — secondary action, deliberately quieter than the card above */}
        <div className="mx-auto mt-8 max-w-[664px] text-center">
          <p className="text-sm text-[#64786D] dark:text-slate-400">{t("alreadyHaveAccount")}</p>
          <Link
            href="/login"
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#079447] transition-colors hover:text-[#067A3A] dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t("signIn")}
            <ArrowRight size={17} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </main>
  );
}
