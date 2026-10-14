"use client";

import { useEffect, useLayoutEffect, useState, useRef, ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, ClipboardPen, Ellipsis, LayoutGrid, LogOut, Settings, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { getAuthToken } from "@/lib/auth";
import { fetchMe } from "@/lib/user-api";
import { fetchPayments, syncInstances } from "@/lib/payments-api";
import { setOverdueBadge, useOverdueCount } from "@/lib/app-badge";
import { monthIn } from "@/lib/today";
import { useLocale } from "@/context/locale-context";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { MENU_ROW_CLASS } from "@/components/menuRow";
import { ToastProvider } from "@/context/toast-context";
import { BRAND } from "@/lib/brand";
import BrandWordmark from "@/components/BrandWordmark";

// Full class strings so Tailwind can see them; picked per user by hashing the email.
const AVATAR_PALETTES = [
  { grad: "from-green-500 to-teal-500", shadow: "shadow-teal-500/30" },
  { grad: "from-blue-500 to-indigo-500", shadow: "shadow-indigo-500/30" },
  { grad: "from-violet-500 to-fuchsia-500", shadow: "shadow-fuchsia-500/30" },
  { grad: "from-orange-500 to-rose-500", shadow: "shadow-rose-500/30" },
  { grad: "from-sky-500 to-cyan-500", shadow: "shadow-cyan-500/30" },
  { grad: "from-amber-500 to-orange-500", shadow: "shadow-orange-500/30" },
];

function avatarPalette(email: string | null | undefined) {
  let h = 0;
  for (const c of email ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard" as const, icon: LayoutGrid, exact: true },
  { href: "/dashboard/payments", labelKey: "payments" as const, icon: CalendarCheck, exact: false },
  { href: "/dashboard/bills", labelKey: "bills" as const, icon: ClipboardPen, exact: true },
];

// Bottom bar width of one tab, in %: the nav items plus the More tab.
const TAB_W = 100 / (NAV_ITEMS.length + 1);

// Settings lives in the avatar menu on desktop and in the hamburger menu on mobile.
const SETTINGS_ITEM = { href: "/dashboard/settings", labelKey: "settings" as const, icon: Settings, exact: false };
// The icon squeezes while its row (sidebar link or bottom-bar tab) is pressed.
const SIDEBAR_ICON_CLASS =
  "transition-transform duration-150 ease-out group-active:scale-80 motion-reduce:transition-none motion-reduce:group-active:scale-100";

const bottomTabClass = (active: boolean) =>
  `group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors ${
    active ? "text-[color:var(--nav-accent)]" : "text-slate-500 dark:text-slate-400"
  }`;

function BottomTabBody({ active, Icon, label, badge = 0 }: { active: boolean; Icon: LucideIcon; label: string; badge?: number }) {
  return (
    <>
      <span className="relative flex h-7 items-center justify-center">
        <Icon
          size={20}
          className={`transition-transform duration-[450ms] ease-[cubic-bezier(.3,1.7,.5,1)] group-active:scale-85 motion-reduce:transition-none ${
            active ? "-translate-y-[3px] scale-[1.18]" : ""
          }`}
        />
        {badge > 0 && (
          <span className="absolute -right-3.5 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-xs font-extrabold leading-none tabular-nums text-white shadow-sm dark:border-slate-800">
            {badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
}

// Desktop sidebar row. The active one takes the theme accent; the moving bar/glow are drawn by the layout.
function SideItem({
  href,
  label,
  Icon,
  active,
  badge = 0,
  innerRef,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
  innerRef: (el: HTMLElement | null) => void;
}) {
  return (
    <Link
      ref={innerRef}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative z-10 flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] transition-colors ${
        active
          ? "font-semibold text-[color:var(--nav-accent)]"
          : "font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
      }`}
    >
      <Icon
        className={`h-5 w-5 transition-transform duration-[450ms] ease-[cubic-bezier(.3,1.7,.5,1)] group-active:scale-85 motion-reduce:transition-none ${
          active ? "scale-[1.18]" : ""
        }`}
      />
      {label}
      {badge > 0 && (
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-extrabold leading-none tabular-nums text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

const SIDE_GROUP_CLASS = "px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, logout } = useAuth();
  const t = useTranslations("DashboardLayout");
  const router = useRouter();
  const pathname = usePathname();
  const { timeZone } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const overdue = useOverdueCount();
  const overdueLoaded = useRef(false);

  useEffect(() => {
    // `isAuthenticated` is forced false for one render right after hydration
    // (useSyncExternalStore's getServerSnapshot, see lib/auth-store.ts) even
    // when the real auth_logged_in cookie is already present — redirecting
    // on that alone bounces a fresh, valid page load to /login, which then
    // bounces back to /dashboard (proxy.ts redirects an authenticated user
    // off a public route), stomping the actual nested route being loaded.
    // Only redirect once the real cookie also agrees we're logged out.
    if (!isAuthenticated && getAuthToken() === null) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe().then((p) => setUserEmail(p.email)).catch(() => {});
    }
  }, [isAuthenticated]);

  // Payments page sets the badge itself; the dashboard home needs it here.
  useEffect(() => {
    if (!isAuthenticated || pathname === "/dashboard/payments") return;
    // Home refreshes on every visit; other pages fetch once so the tab badge is filled.
    if (pathname !== "/dashboard" && overdueLoaded.current) return;
    overdueLoaded.current = true;
    // Seed this month's recurring payments first (as the Payments page does), or the
    // count is short until that page is opened.
    const month = monthIn(timeZone);
    syncInstances(month)
      .catch(() => {})
      .then(() => fetchPayments(month))
      .then((list) => setOverdueBadge(list.filter((i) => i.status === "overdue").length))
      .catch(() => {});
  }, [isAuthenticated, pathname, timeZone]);

  // Close mobile menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // The account panel also closes on Escape (and when a link in the bar or panel is tapped).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Bottom bar: index of the active tab (More = last) drives the sliding indicator.
  const navIdx = NAV_ITEMS.findIndex(
    ({ href, exact }) => pathname === href || (!exact && pathname.startsWith(href + "/")),
  );
  const tabIdx = menuOpen || pathname.startsWith(SETTINGS_ITEM.href) ? NAV_ITEMS.length : navIdx;
  // Derived during render (not a ref) so the stretch direction is set in the same render as the move.
  const [tabState, setTabState] = useState({ idx: tabIdx, dir: "R" });
  if (tabState.idx !== tabIdx) {
    setTabState({ idx: tabIdx, dir: tabIdx > tabState.idx ? "R" : "L" });
  }
  const tabDir = tabState.dir;

  // Desktop sidebar indicator: measured position of the active row, relative to the sidebar content.
  const sideRef = useRef<HTMLDivElement>(null);
  const sideItems = useRef<(HTMLElement | null)[]>([]);
  const [sideInd, setSideInd] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const box = sideRef.current;
    if (!box) return;
    function measure() {
      const el = sideItems.current[tabIdx];
      if (!box || !el) return setSideInd(null);
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setSideInd({ top: r.top - b.top, height: r.height });
    }
    measure();
    // Rows shift without resizing the box (e.g. when the email block loads in), so re-measure on those too.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    sideItems.current.forEach((el) => el && ro.observe(el));
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [tabIdx, isAuthenticated, userEmail]);

  if (!isAuthenticated) return null;

  const initials = userEmail ? userEmail[0].toUpperCase() : "?";
  const palette = avatarPalette(userEmail);

  return (
    <div className="flex min-h-dvh flex-col -mb-9">
      {/* Desktop sidebar */}
      <aside className="[view-transition-name:app-sidebar] fixed inset-y-0 left-0 z-50 hidden w-60 flex-col overflow-y-auto border-r border-slate-200 dark:border-slate-700 md:flex">
        <div ref={sideRef} className="relative flex min-h-full flex-1 flex-col">
          {sideInd && (
            <>
              <span
                aria-hidden
                className="side-ind pointer-events-none absolute inset-x-0 top-0 z-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--nav-accent)_18%,transparent),color-mix(in_srgb,var(--nav-accent)_5%,transparent)_60%,transparent)]"
                style={{ height: sideInd.height, transform: `translateY(${sideInd.top}px)` }}
              />
              <span
                aria-hidden
                className="side-ind pointer-events-none absolute left-0 top-0 z-20 w-1 rounded-r-full bg-[var(--nav-accent)]"
                style={{ height: sideInd.height - 12, transform: `translateY(${sideInd.top + 6}px)` }}
              />
            </>
          )}

          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-4 transition-opacity hover:opacity-80"
          >
            <Image src="/pt-logo.png" alt={BRAND.name} width={32} height={32} className="rounded-xl" />
            <span className="brand-wordmark text-lg font-bold tracking-tight">
              <BrandWordmark />
            </span>
          </Link>

          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

          {/* Always rendered (blank until the email loads) so the rows below never jump and the indicator stays put. */}
          <div className="flex h-14 items-center gap-2.5 px-4">
            {userEmail && (
              <>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.grad} text-sm font-bold text-white shadow-md ${palette.shadow}`}>
                  {initials}
                </div>
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">{userEmail}</span>
              </>
            )}
          </div>
          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

          <nav className="flex flex-col gap-0.5 p-3">
            <p className={SIDE_GROUP_CLASS}>{t("menuGroup")}</p>
            {NAV_ITEMS.map(({ href, labelKey, icon }, i) => (
              <SideItem
                key={href}
                href={href}
                label={t(labelKey)}
                Icon={icon}
                active={tabIdx === i}
                badge={href === "/dashboard/payments" ? overdue : 0}
                innerRef={(el) => { sideItems.current[i] = el; }}
              />
            ))}
          </nav>

          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

          <div className="flex flex-col gap-0.5 p-3">
            <p className={SIDE_GROUP_CLASS}>{t("accountGroup")}</p>
            <SideItem
              href={SETTINGS_ITEM.href}
              label={t(SETTINGS_ITEM.labelKey)}
              Icon={Settings}
              active={tabIdx === NAV_ITEMS.length}
              innerRef={(el) => { sideItems.current[NAV_ITEMS.length] = el; }}
            />
            <ThemeToggle />
            <LanguageToggle />
          </div>

          <div className="flex-1" />

          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

          <div className="p-3">
            <button
              data-logout-trigger
              onClick={logout}
              className="group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <LogOut className={`h-5 w-5 ${SIDEBAR_ICON_CLASS}`} />
              {t("logOut")}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="[view-transition-name:app-header] relative sticky top-0 z-10 md:hidden border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <Image src="/pt-logo.png" alt={BRAND.name} width={32} height={32} className="rounded-xl" />
            <span className="brand-wordmark text-lg font-bold tracking-tight">
              <BrandWordmark />
            </span>
          </Link>

        </div>
      </header>

      {/* Mobile bottom tab bar; the last tab ("More") opens a panel (email, Settings, theme, language, log out). */}
      <nav
        ref={menuRef}
        className="[view-transition-name:bottom-nav] fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-700 dark:bg-slate-800/90"
      >
        {/* Page background (same fixed layers as <body>) faded in over the content, so it sinks under the bar. */}
        {!menuOpen && (
          <div
            aria-hidden
            className="nav-fade pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[#F6FAF8] [mask-image:linear-gradient(to_top,#000_0%,rgba(0,0,0,.85)_35%,transparent)] dark:bg-slate-900"
          />
        )}
        {menuOpen && (
          <div className="absolute inset-x-0 bottom-full max-h-[70dvh] overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 shadow-md dark:border-slate-700 dark:bg-slate-800">
            <div className="mx-auto flex max-w-4xl flex-col gap-1">
              {userEmail && (
                <>
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.grad} text-sm font-bold text-white shadow-md ${palette.shadow}`}>
                      {initials}
                    </div>
                    <span className="truncate text-sm text-slate-500 dark:text-slate-400">{userEmail}</span>
                  </div>
                  <div className="mx-3 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <Link href={SETTINGS_ITEM.href} onClick={() => setMenuOpen(false)} className={MENU_ROW_CLASS}>
                  <Settings className="h-[18px] w-[18px] shrink-0 md:h-[15px] md:w-[15px]" />
                  {t(SETTINGS_ITEM.labelKey)}
                </Link>
                <ThemeToggle />
                <LanguageToggle />
                <button
                  data-logout-trigger
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-600 transition-all md:gap-2 md:rounded-lg md:py-2 md:text-sm hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <LogOut className="h-[18px] w-[18px] shrink-0 md:h-[15px] md:w-[15px]" />
                  {t("logOut")}
                </button>
              </div>
            </div>
          </div>
        )}
        {tabIdx >= 0 && (
          <>
            <span
              aria-hidden
              data-dir={tabDir}
              className="tab-ind pointer-events-none absolute top-0 h-[62px] bg-[radial-gradient(ellipse_70%_100%_at_50%_0,color-mix(in_srgb,var(--nav-accent)_28%,transparent),color-mix(in_srgb,var(--nav-accent)_10%,transparent)_55%,transparent_80%)] [mask-composite:intersect] [mask-image:linear-gradient(#000,transparent),linear-gradient(90deg,transparent,#000_25%,#000_75%,transparent)]"
              style={{ left: `${tabIdx * TAB_W}%`, right: `${100 - (tabIdx + 1) * TAB_W}%` }}
            />
            <span
              aria-hidden
              data-dir={tabDir}
              className="tab-ind pointer-events-none absolute -top-px z-20 h-[3px] rounded-b-md bg-gradient-to-r from-transparent via-[var(--nav-accent)] to-transparent"
              style={{ left: `${tabIdx * TAB_W + 2}%`, right: `${100 - (tabIdx + 1) * TAB_W + 2}%` }}
            />
          </>
        )}
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }, i) => {
          const active = tabIdx === i;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={bottomTabClass(active)}
            >
              <BottomTabBody
                active={active}
                Icon={Icon}
                label={t(labelKey)}
                badge={href === "/dashboard/payments" ? overdue : 0}
              />
            </Link>
          );
        })}
        {(() => {
          const active = tabIdx === NAV_ITEMS.length;
          return (
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-current={!menuOpen && active ? "page" : undefined}
              className={bottomTabClass(active)}
            >
              <BottomTabBody active={active} Icon={Ellipsis} label={t("more")} />
            </button>
          );
        })()}
      </nav>

      {/* Page content */}
      <ToastProvider>
        <main className="flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:ml-60 md:pb-0">
          {/* Keyed by route: a tab switch crossfades old page into new instead of blinking. */}
          <ViewTransition key={pathname} name="page" enter="auto" exit="auto" default="none">
            {children}
          </ViewTransition>
        </main>
      </ToastProvider>
    </div>
  );
}
