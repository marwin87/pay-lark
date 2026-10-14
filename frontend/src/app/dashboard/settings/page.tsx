"use client";

import { createElement, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  DatabaseBackup,
  FileText,
  Info,
  HardDriveDownload,
  HardDriveUpload,
  SlidersHorizontal,
  Tags,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";
import { deleteAccount, fetchMe, UserProfile } from "@/lib/user-api";
import { notifyAuthChange } from "@/lib/auth-store";
import { useAuth } from "@/context/auth-context";
import BackupButton from "@/components/BackupButton";
import RestoreButton from "@/components/RestoreButton";
import SnapshotRecoverySection from "@/components/SnapshotRecoverySection";
import { Tile, TILE_STYLES, type TileColor } from "@/components/settings/Tile";
import { ProfileTile } from "@/components/settings/ProfileTile";
import { PasswordTile } from "@/components/settings/PasswordTile";
import { CurrencyTile } from "@/components/settings/CurrencyTile";
import { TimeZoneTile } from "@/components/settings/TimeZoneTile";
import { DecimalSeparatorTile } from "@/components/settings/DecimalSeparatorTile";
import { LanguagesTile } from "@/components/settings/LanguagesTile";
import { ExportSettingsTile } from "@/components/settings/ExportSettingsTile";
import { ShareSettingsTile } from "@/components/settings/ShareSettingsTile";
import { EmailNotificationsTile } from "@/components/settings/EmailNotificationsTile";
import { TelegramNotificationsTile } from "@/components/settings/TelegramNotificationsTile";
import { BrowserNotificationsTile } from "@/components/settings/BrowserNotificationsTile";
import { ServerTimeNote } from "@/components/settings/ServerTimeNote";
import { AboutTile } from "@/components/settings/AboutTile";
import { CategoriesTile } from "@/components/settings/CategoriesTile";
import { UnsavedChangesDialog } from "@/components/settings/UnsavedChangesDialog";
import PageHeader from "@/components/PageHeader";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";

const TABS = [
  "account",
  "preferences",
  "notifications",
  "categories",
  "reports",
  "data",
  "about",
] as const;
type TabKey = (typeof TABS)[number];

const TAB_ICON: Record<TabKey, LucideIcon> = {
  account: User,
  preferences: SlidersHorizontal,
  notifications: Bell,
  categories: Tags,
  reports: FileText,
  data: DatabaseBackup,
  about: Info,
};

// Grey while inactive; when active/expanded it inherits the tab's text color (currentColor).
const tabIconClass = (active: boolean) =>
  active ? "shrink-0" : "shrink-0 text-slate-400 dark:text-slate-500";

// One color per tab; tiles inside a tab and the active-tab underline all use it.
const TAB_COLOR: Record<TabKey, TileColor> = {
  account: "blue",
  preferences: "purple",
  notifications: "yellow",
  categories: "green",
  reports: "teal",
  data: "orange",
  about: "slate",
};

// Tile ids per tab, in render order. A tab with more than one tile gets a collapse/expand-all button.
const TILES_BY_TAB: Record<TabKey, string[]> = {
  account: ["profile", "password", "deleteAccount"],
  preferences: ["currency", "timeZone", "decimalSeparator", "languages"],
  notifications: ["email", "telegram", "browser"],
  categories: ["categories"],
  reports: ["exportXlsx", "exportPdf", "share"],
  data: ["backup", "restore"],
  about: ["about"],
};

function tabFromUrl(): TabKey {
  if (typeof window === "undefined") return "account";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((k) => k === tab) ?? "account";
}

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  const tDelete = useTranslations("DeleteAccountDialog");
  const router = useRouter();
  const { logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [currencyDirty, setCurrencyDirty] = useState(false);
  const [timeZoneDirty, setTimeZoneDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [telegramDirty, setTelegramDirty] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pendingLogout, setPendingLogout] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Safe to read the URL in the initializer: nothing tab-related renders until the profile loads.
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl);
  // Mobile accordion: which sections are expanded, independent of activeTab — each one
  // opens/closes on its own instead of exactly one always being open.
  // Starts fully collapsed unless a ?tab= deep link names a section to open.
  const [expandedMobile, setExpandedMobile] = useState<Set<TabKey>>(
    () => new Set(typeof window !== "undefined" && window.location.search.includes("tab=") ? [tabFromUrl()] : []),
  );

  const isDirtyAny =
    profileDirty ||
    currencyDirty ||
    timeZoneDirty ||
    emailDirty ||
    telegramDirty ||
    passwordDirty;

  const onProfileDirty = useCallback((d: boolean) => setProfileDirty(d), []);
  const onCurrencyDirty = useCallback((d: boolean) => setCurrencyDirty(d), []);
  const onTimeZoneDirty = useCallback((d: boolean) => setTimeZoneDirty(d), []);
  const onEmailDirty = useCallback((d: boolean) => setEmailDirty(d), []);
  const onTelegramDirty = useCallback((d: boolean) => setTelegramDirty(d), []);
  const onPasswordDirty = useCallback((d: boolean) => setPasswordDirty(d), []);

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `?tab=${tab}`);
  }

  // Tiles can be folded one by one; every tile starts open. Keyed by tile id, see TILES_BY_TAB.
  const [collapsedTiles, setCollapsedTiles] = useState<Set<string>>(new Set());

  function tileFold(id: string) {
    return {
      isCollapsed: collapsedTiles.has(id),
      onToggle: () =>
        setCollapsedTiles((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    };
  }

  // Fold everything if anything is open, otherwise open everything. Desktop acts on the
  // active tab, mobile on every expanded section.
  function foldAllButton(ids: string[], className: string) {
    if (ids.length === 0) return null;
    const anyOpen = ids.some((id) => !collapsedTiles.has(id));
    return (
      <button
        type="button"
        onClick={() =>
          setCollapsedTiles((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              if (anyOpen) next.add(id);
              else next.delete(id);
            }
            return next;
          })
        }
        className={`items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400 ${className}`}
      >
        {anyOpen ? <ChevronsDownUp size={18} /> : <ChevronsUpDown size={18} />}
        {anyOpen ? t("collapseAll") : t("expandAll")}
      </button>
    );
  }
  const desktopTileIds = TILES_BY_TAB[activeTab];
  const mobileTileIds = TABS.filter((tab) => expandedMobile.has(tab)).flatMap((tab) => TILES_BY_TAB[tab]);

  function toggleMobileSection(tab: TabKey) {
    setExpandedMobile((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  }

  useEffect(() => {
    fetchMe().then(setProfile).catch(() => {});
  }, []);

  // Browser tab close / refresh guard
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirtyAny) e.preventDefault();
    },
    [isDirtyAny],
  );
  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [handleBeforeUnload]);

  // In-app navigation guard: capture all anchor clicks at document level
  const handleNavClick = useCallback(
    (e: MouseEvent) => {
      if (!isDirtyAny) return;
      const target = e.target as Element;
      if (target.closest("[data-logout-trigger]")) {
        e.preventDefault();
        e.stopPropagation();
        setPendingLogout(true);
        return;
      }
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:"))
        return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    },
    [isDirtyAny],
  );
  useEffect(() => {
    document.addEventListener("click", handleNavClick, true);
    return () => document.removeEventListener("click", handleNavClick, true);
  }, [handleNavClick]);

  function confirmLeave() {
    if (pendingLogout) {
      setPendingLogout(false);
      logout();
      return;
    }
    if (pendingHref) {
      setPendingHref(null);
      router.push(pendingHref);
    }
  }

  async function handleDeleteConfirm(password: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(password);
      setDeleteDialogOpen(false);
      notifyAuthChange();
      router.refresh();
      router.push("/login");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError && err.status === 401
          ? tDelete("wrongPassword")
          : t("deleteAccount.error"),
      );
      setDeleting(false);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 space-y-4">
      <PageHeader title={t("pageTitle")} subtitle={t("subtitle")} />

      <div
        role="tablist"
        className="hidden shadow-[inset_0_-1px_0_0_var(--color-slate-200)] dark:shadow-[inset_0_-1px_0_0_var(--color-slate-700)] sm:flex sm:flex-nowrap sm:overflow-x-auto sm:overflow-y-hidden"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`settings-tab-${tab}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`settings-panel-${tab}`}
            onClick={() => selectTab(tab)}
            className={`flex flex-none items-center gap-2 whitespace-nowrap px-2.5 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? TILE_STYLES[TAB_COLOR[tab]].tab
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {createElement(TAB_ICON[tab], { size: 16, className: tabIconClass(activeTab === tab) })}
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      {/* Same spot in every tab, so tiles never shift when switching tabs. */}
      <div className="hidden justify-end sm:flex">{foldAllButton(desktopTileIds, "flex")}</div>
      {mobileTileIds.length > 0 && (
        <div className="flex justify-end sm:hidden">{foldAllButton(mobileTileIds, "flex")}</div>
      )}

      {/* Mobile accordion header for "account" — desktop uses the tablist above instead. */}
      <button
        type="button"
        onClick={() => toggleMobileSection("account")}
        aria-expanded={expandedMobile.has("account")}
        aria-controls="settings-panel-account"
        id="settings-tab-account-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("account")
            ? TILE_STYLES[TAB_COLOR.account].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.account size={16} className={tabIconClass(expandedMobile.has("account"))} />
        {t("tabs.account")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("account") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-account"
        aria-labelledby="settings-tab-account settings-tab-account-mobile"
        className={`space-y-4 ${expandedMobile.has("account") ? "block" : "hidden"} ${
          activeTab === "account" ? "sm:block" : "sm:hidden"
        }`}
      >
        <ProfileTile {...tileFold("profile")}
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onProfileDirty}
          t={t}
        />
        <PasswordTile {...tileFold("password")} onDirtyChange={onPasswordDirty} t={t} />

        <Tile
          color="red"
          {...tileFold("deleteAccount")}
          icon={Trash2}
          title={t("deleteAccount.title")}
          description={t("deleteAccount.description")}
          t={t}
        >
          <button
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Trash2 size={18} />
            <span>{t("deleteAccount.button")}</span>
          </button>
        </Tile>
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("preferences")}
        aria-expanded={expandedMobile.has("preferences")}
        aria-controls="settings-panel-preferences"
        id="settings-tab-preferences-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("preferences")
            ? TILE_STYLES[TAB_COLOR.preferences].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.preferences size={16} className={tabIconClass(expandedMobile.has("preferences"))} />
        {t("tabs.preferences")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("preferences") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-preferences"
        aria-labelledby="settings-tab-preferences settings-tab-preferences-mobile"
        className={`space-y-4 ${expandedMobile.has("preferences") ? "block" : "hidden"} ${
          activeTab === "preferences" ? "sm:block" : "sm:hidden"
        }`}
      >
        <CurrencyTile {...tileFold("currency")}
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onCurrencyDirty}
          t={t}
        />
        <TimeZoneTile {...tileFold("timeZone")}
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onTimeZoneDirty}
          t={t}
        />
        <DecimalSeparatorTile {...tileFold("decimalSeparator")} t={t} />
        <LanguagesTile {...tileFold("languages")} t={t} />
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("notifications")}
        aria-expanded={expandedMobile.has("notifications")}
        aria-controls="settings-panel-notifications"
        id="settings-tab-notifications-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("notifications")
            ? TILE_STYLES[TAB_COLOR.notifications].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.notifications size={16} className={tabIconClass(expandedMobile.has("notifications"))} />
        {t("tabs.notifications")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("notifications") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-notifications"
        aria-labelledby="settings-tab-notifications settings-tab-notifications-mobile"
        className={`space-y-4 ${expandedMobile.has("notifications") ? "block" : "hidden"} ${
          activeTab === "notifications" ? "sm:block" : "sm:hidden"
        }`}
      >
        <ServerTimeNote timeZone={profile.timezone} />

        <EmailNotificationsTile {...tileFold("email")}
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onEmailDirty}
          t={t}
        />

        <TelegramNotificationsTile {...tileFold("telegram")}
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onTelegramDirty}
          t={t}
        />

        <BrowserNotificationsTile {...tileFold("browser")} profile={profile} t={t} />
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("categories")}
        aria-expanded={expandedMobile.has("categories")}
        aria-controls="settings-panel-categories"
        id="settings-tab-categories-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("categories")
            ? TILE_STYLES[TAB_COLOR.categories].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.categories size={16} className={tabIconClass(expandedMobile.has("categories"))} />
        {t("tabs.categories")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("categories") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-categories"
        aria-labelledby="settings-tab-categories settings-tab-categories-mobile"
        className={`space-y-4 ${expandedMobile.has("categories") ? "block" : "hidden"} ${
          activeTab === "categories" ? "sm:block" : "sm:hidden"
        }`}
      >
        <CategoriesTile {...tileFold("categories")} t={t} />
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("reports")}
        aria-expanded={expandedMobile.has("reports")}
        aria-controls="settings-panel-export"
        id="settings-tab-export-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("reports")
            ? TILE_STYLES[TAB_COLOR.reports].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.reports size={16} className={tabIconClass(expandedMobile.has("reports"))} />
        {t("tabs.reports")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("reports") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-export"
        aria-labelledby="settings-tab-export settings-tab-export-mobile"
        className={`space-y-4 ${expandedMobile.has("reports") ? "block" : "hidden"} ${
          activeTab === "reports" ? "sm:block" : "sm:hidden"
        }`}
      >
        <ExportSettingsTile {...tileFold("exportXlsx")} profile={profile} onProfileUpdate={setProfile} t={t} />
        <ExportSettingsTile {...tileFold("exportPdf")} format="pdf" profile={profile} onProfileUpdate={setProfile} t={t} />
        <ShareSettingsTile {...tileFold("share")} profile={profile} onProfileUpdate={setProfile} t={t} />
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("data")}
        aria-expanded={expandedMobile.has("data")}
        aria-controls="settings-panel-data"
        id="settings-tab-data-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("data")
            ? TILE_STYLES[TAB_COLOR.data].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.data size={16} className={tabIconClass(expandedMobile.has("data"))} />
        {t("tabs.data")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("data") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-data"
        aria-labelledby="settings-tab-data settings-tab-data-mobile"
        className={`space-y-4 ${expandedMobile.has("data") ? "block" : "hidden"} ${
          activeTab === "data" ? "sm:block" : "sm:hidden"
        }`}
      >
        <Tile
          color={TAB_COLOR.data}
          {...tileFold("backup")}
          icon={HardDriveDownload}
          title={t("backup.title")}
          description={t("backup.description")}
          t={t}
        >
          <BackupButton label={t("backup.button")} />
        </Tile>

        <Tile
          color={TAB_COLOR.data}
          {...tileFold("restore")}
          icon={HardDriveUpload}
          title={t("restore.title")}
          description={t("restore.description")}
          t={t}
        >
          <RestoreButton label={t("restore.button")} />
          <SnapshotRecoverySection />
        </Tile>
      </div>

      <button
        type="button"
        onClick={() => toggleMobileSection("about")}
        aria-expanded={expandedMobile.has("about")}
        aria-controls="settings-panel-about"
        id="settings-tab-about-mobile"
        className={`flex w-full items-center justify-between border-b border-slate-200 py-3 text-left text-sm font-semibold dark:border-slate-700 sm:hidden ${
          expandedMobile.has("about")
            ? TILE_STYLES[TAB_COLOR.about].icon
            : "text-slate-600 dark:text-slate-300"
        }`}
      >
        <span className="flex items-center gap-2">
        <TAB_ICON.about size={16} className={tabIconClass(expandedMobile.has("about"))} />
        {t("tabs.about")}
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
            expandedMobile.has("about") ? "rotate-90" : ""
          }`}
        />
      </button>
      <div
        role="tabpanel"
        id="settings-panel-about"
        aria-labelledby="settings-tab-about settings-tab-about-mobile"
        className={`space-y-4 ${expandedMobile.has("about") ? "block" : "hidden"} ${
          activeTab === "about" ? "sm:block" : "sm:hidden"
        }`}
      >
        <AboutTile {...tileFold("about")} color={TAB_COLOR.about} t={t} />
      </div>

      {(pendingHref || pendingLogout) && (
        <UnsavedChangesDialog
          onLeave={confirmLeave}
          onStay={() => {
            setPendingHref(null);
            setPendingLogout(false);
          }}
          t={t}
        />
      )}

      {deleteDialogOpen && (
        <DeleteAccountDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialogOpen(false)}
          deleting={deleting}
          error={deleteError}
        />
      )}
    </div>
  );
}
