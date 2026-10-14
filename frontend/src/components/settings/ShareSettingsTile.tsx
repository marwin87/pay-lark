"use client";

import { useEffect, useState } from "react";
import { Plus, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { updateMe, type UserProfile } from "@/lib/user-api";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { Tile } from "./Tile";
import { useToast } from "@/context/toast-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 20; // mirrors ShareEmails in backend/app/schemas/auth.py

export function ShareSettingsTile({
  profile,
  onProfileUpdate,
  t,
  isCollapsed,
  onToggle,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const showToast = useToast();
  const tc = useTranslations("Common");
  const [enabled, setEnabled] = useState(profile.share_enabled);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ configured: boolean }>("/auth/smtp-status")
      .then((d) => setSmtpConfigured(d?.configured ?? false))
      .catch(() => setSmtpConfigured(false));
  }, []);

  async function toggle(value: boolean) {
    setEnabled(value);
    setBusy(true);
    try {
      onProfileUpdate(await updateMe({ share_enabled: value }));
      showToast(tp("settingsSaved"));
    } catch {
      setEnabled(!value);
    } finally {
      setBusy(false);
    }
  }

  const addr = newEmail.trim().toLowerCase();
  const canAdd =
    EMAIL_RE.test(addr) && !profile.share_emails.includes(addr) && profile.share_emails.length < MAX_EMAILS;

  async function saveEmails(next: string[]) {
    setBusy(true);
    try {
      onProfileUpdate(await updateMe({ share_emails: next }));
      showToast(tp("settingsSaved"));
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addEmail() {
    if (canAdd && (await saveEmails([...profile.share_emails, addr]))) setNewEmail("");
  }

  return (
    <Tile
      color="teal"
      icon={Share2}
      title={tp("shareByEmail.title")}
      description={tp("shareByEmail.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <Switch
        checked={enabled}
        onChange={toggle}
        label={tp("shareByEmail.toggleLabel")}
        disabled={busy || smtpConfigured === false}
      />
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("shareByEmail.recipientsLabel")}
        </p>
        <ul className="mb-3 flex flex-col gap-1">
          {profile.share_emails.map((e) => (
            <li
              key={e}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              <span className="truncate">{e}</span>
              <button
                type="button"
                aria-label={tp("shareByEmail.remove", { email: e })}
                disabled={busy}
                onClick={() => saveEmails(profile.share_emails.filter((x) => x !== e))}
                className="ml-2 text-slate-400 transition-colors hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            addEmail();
          }}
        >
          <Input
            type="email"
            maxLength={254}
            autoComplete="off"
            value={newEmail}
            onChange={(ev) => setNewEmail(ev.target.value)}
            placeholder={tp("shareByEmail.addPlaceholder")}
            aria-label={tp("shareByEmail.addPlaceholder")}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!canAdd || busy}
            aria-label={tp("shareByEmail.add")}
            className="flex items-center rounded-xl border border-transparent bg-emerald-600 px-3 text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
        </form>
      </div>
      {smtpConfigured === false && (
        <p className="text-sm text-slate-400 dark:text-slate-500">{tc("smtpNotConfigured")}</p>
      )}
    </Tile>
  );
}
