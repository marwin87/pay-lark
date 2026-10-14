"use client";

import { ChevronDown, CircleHelp, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { sendTelegramTest, updateMe, type UserProfile } from "@/lib/user-api";
import { ChannelScheduleSection } from "./ChannelScheduleSection";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Tile } from "./Tile";
import { useToast } from "@/context/toast-context";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";
const CHAT_ID_RE = /^-?\d{1,20}$/;
const BOT_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;

export function TelegramNotificationsTile({
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
  isCollapsed,
  onToggle,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const showToast = useToast();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(profile.telegram_chat_id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const onScheduleDirty = useCallback((d: boolean) => setScheduleDirty(d), []);

  const trimmed = chatId.trim();
  const trimmedToken = botToken.trim();
  const isDirty =
    trimmed !== (profile.telegram_chat_id ?? "") || trimmedToken !== "";
  const isTokenInvalid = trimmedToken !== "" && !BOT_TOKEN_RE.test(trimmedToken);
  const isChatIdInvalid = trimmed !== "" && !CHAT_ID_RE.test(trimmed);
  const isInvalid = isTokenInvalid || isChatIdInvalid;
  const credentialsSaved =
    profile.telegram_bot_token_set && !!profile.telegram_chat_id;
  const hasCredentials = profile.telegram_bot_token_set || !!profile.telegram_chat_id;

  async function persist(data: Parameters<typeof updateMe>[0]) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMe(data);
      onProfileUpdate(updated);
      setChatId(updated.telegram_chat_id ?? "");
      setBotToken("");
      setTestResult(null);
      showToast(tp("telegramSaved"));
    } catch {
      setSaveError(tp("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    onDirtyChange(isDirty || scheduleDirty);
  }, [isDirty, scheduleDirty, onDirtyChange]);

  // Token is write-only: only sent when the user typed a new one.
  const save = () =>
    persist({
      telegram_chat_id: trimmed,
      ...(trimmedToken ? { telegram_bot_token: trimmedToken } : {}),
    });
  const remove = () => persist({ telegram_chat_id: "", telegram_bot_token: "" });

  async function test() {
    setIsTesting(true);
    setTestResult(null);
    try {
      await sendTelegramTest();
      setTestResult("ok");
    } catch {
      setTestResult("error");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Tile
      color="yellow"
      icon={Send}
      title={tp("telegramNotifications.title")}
      description={tp("telegramNotifications.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <details className="group rounded-lg border border-slate-200 bg-white text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
        <summary className="flex cursor-pointer select-none list-none items-center gap-2 rounded-lg px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-600/50 [&::-webkit-details-marker]:hidden">
          <CircleHelp size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
          <span className="flex-1">{tp("telegramNotifications.helpTitle")}</span>
          <ChevronDown
            size={14}
            className="shrink-0 text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500"
          />
        </summary>
        <ol className="list-decimal space-y-1.5 border-t border-slate-100 px-3 py-3 pl-8 text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <li>{tp("telegramNotifications.helpStep1")}</li>
          <li>{tp("telegramNotifications.helpStep2")}</li>
          <li>
            {tp("telegramNotifications.helpStep3")}
            <code className="mt-1 block break-all rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
            </code>
          </li>
          <li>{tp("telegramNotifications.helpStep4")}</li>
        </ol>
      </details>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("telegramNotifications.botTokenLabel")}
          <div className="mt-1">
          <PasswordInput
            autoComplete="off"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={
              profile.telegram_bot_token_set
                ? "••••••••••"
                : tp("telegramNotifications.botTokenPlaceholder")
            }
            className={INPUT_CLASS.replace("mt-1 ", "")}
          />
          </div>
        </label>
        {profile.telegram_bot_token_unreadable && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {tp("telegramNotifications.tokenUnreadable")}
          </p>
        )}
        {profile.telegram_bot_token_set && !isDirty && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tp("telegramNotifications.botTokenSaved")}
          </p>
        )}
        {isTokenInvalid && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {tp("telegramNotifications.invalidToken")}
          </p>
        )}
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("telegramNotifications.chatIdLabel")}
          <input
            type="text"
            inputMode="numeric"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={tp("telegramNotifications.chatIdPlaceholder")}
            className={INPUT_CLASS}
          />
        </label>
        {isChatIdInvalid && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {tp("telegramNotifications.invalidId")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <button
              onClick={save}
              disabled={isSaving || isInvalid}
              className="rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
            >
              {isSaving ? t("saving") : t("save")}
            </button>
          )}
          <button
            onClick={test}
            disabled={
              isTesting ||
              isDirty ||
              !profile.telegram_chat_id ||
              !profile.telegram_bot_token_set
            }
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
          >
            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isTesting
              ? tp("telegramNotifications.testSending")
              : tp("telegramNotifications.testButton")}
          </button>
        </div>

        {hasCredentials && (
          <button
            onClick={remove}
            disabled={isSaving}
            className="text-sm text-slate-500 underline hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400"
          >
            {tp("telegramNotifications.remove")}
          </button>
        )}

        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        {testResult === "ok" && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {tp("telegramNotifications.testSent")}
          </p>
        )}
        {testResult === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {tp("telegramNotifications.testFailed")}
          </p>
        )}
      </div>

      <ChannelScheduleSection
        channel="telegram"
        profile={profile}
        onProfileUpdate={onProfileUpdate}
        onDirtyChange={onScheduleDirty}
        t={t}
        masterLabel={tp("telegramNotifications.masterToggle")}
        noneWarning={tp("telegramNotifications.noneWarning")}
        disabledHint={credentialsSaved ? undefined : tp("telegramNotifications.needCredentials")}
      />
    </Tile>
  );
}
