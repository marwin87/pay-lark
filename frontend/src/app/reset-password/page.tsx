"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LockKeyhole, ArrowRight, Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { passwordTooLong } from "@/lib/auth-validation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BRAND } from "@/lib/brand";
import BrandWordmark from "@/components/BrandWordmark";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const t = useTranslations("Auth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const newPassword = form.get("new_password") as string;
    const confirmPassword = form.get("confirm_password") as string;

    // Checked client-side (and localized) so a weak password never reaches
    // the catch block below, which treats any backend failure as an
    // invalid/expired token — that would otherwise mislabel this case.
    if (newPassword.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (passwordTooLong(newPassword)) {
      setError(t("passwordTooLong"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      router.push("/login");
    } catch (err) {
      // 429 means "slow down", not "this link is bad".
      if (err instanceof ApiError && err.status === 429) setError(t("tooManyAttempts"));
      else setTokenInvalid(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[664px] rounded-[18px] border border-[#E7EEE9] bg-white px-5 py-6 shadow-[0_10px_30px_rgba(16,35,26,0.06),0_2px_8px_rgba(16,35,26,0.03)] dark:border-slate-700 dark:bg-slate-800 sm:rounded-[20px] sm:p-8">
      {tokenInvalid ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-red-700 dark:text-red-400">
            {t("invalidOrExpiredToken")}
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#079447] transition-colors hover:text-[#067A3A] dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t("requestNewLink")}
            <ArrowRight size={17} strokeWidth={2} />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new_password"
              className="text-base font-semibold text-[#263B31] dark:text-slate-300"
            >
              {t("newPasswordLabel")}
            </label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              size="lg"
              icon={LockKeyhole}
              placeholder={t("passwordPlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirm_password"
              className="text-base font-semibold text-[#263B31] dark:text-slate-300"
            >
              {t("confirmPasswordLabel")}
            </label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              size="lg"
              icon={LockKeyhole}
              placeholder={t("passwordPlaceholder")}
            />
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
                {t("settingPassword")}
              </>
            ) : (
              <>
                {t("setPassword")}
                <ArrowRight size={20} />
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("Auth");

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
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/pt-logo.png"
            alt={BRAND.name}
            width={96}
            height={96}
            className="rounded-2xl shadow-md"
            priority
          />
          <p className="text-xl font-bold tracking-tight sm:text-2xl">
            <BrandWordmark />
          </p>
        </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-[32px] font-bold leading-[1.15] tracking-tight text-[#10231A] dark:text-slate-100 sm:text-[40px]">
            {t("resetPasswordTitle")}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#64786D] dark:text-slate-400 sm:mt-3 sm:text-base">
            {t("resetPasswordSubtitle")}
          </p>
        </div>

        <Suspense>
          <ResetPasswordForm />
        </Suspense>

        <div className="mx-auto mt-8 max-w-[664px] text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#079447] transition-colors hover:text-[#067A3A] dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t("signIn")}
            <ArrowRight size={17} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </main>
  );
}
