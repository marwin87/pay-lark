"use client";

import { usePathname } from "next/navigation";
import { copyright } from "@/lib/copyright";
import { BRAND } from "@/lib/brand";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

// Opaque bar pinned to the viewport bottom; <body> reserves matching padding (pb-9)
// so page content ends above it. z-40 keeps modals (z-50) on top.
export default function AppFooter() {
  // Inside the dashboard the version and copyright live in Settings → About instead.
  const inDashboard = usePathname().startsWith("/dashboard");
  return (
    <footer className={`app-footer fixed inset-x-0 bottom-0 z-40 flex h-9 items-center justify-center border-t border-slate-200 bg-[#F6FAF8] text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 ${inDashboard ? "hidden" : ""}`}>
      <span>{copyright()} · {BRAND.name} · {APP_VERSION}</span>
    </footer>
  );
}
