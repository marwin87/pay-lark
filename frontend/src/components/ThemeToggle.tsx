"use client";

import { useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTheme, setTheme as saveTheme, THEMES, type Theme } from "@/lib/theme";
import { updateMe } from "@/lib/user-api";
import { MENU_ROW_CLASS } from "@/components/menuRow";

/** Menu row that expands in place into the available themes. Stays open after a pick. */
export default function ThemeToggle() {
  const t = useTranslations("ThemeToggle");
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "light" : getTheme(),
  );
  const [open, setOpen] = useState(false);

  function pick(next: Theme) {
    saveTheme(next);
    setTheme(next);
    updateMe({ theme: next }).catch(() => {
      // persist failure is non-fatal
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("ariaLabel")}
        suppressHydrationWarning
        className={MENU_ROW_CLASS}
      >
        <Palette className="h-[20px] w-[20px] shrink-0 md:h-[17px] md:w-[17px]" />
        <span>{t("label")}</span>
        <span
          suppressHydrationWarning
          className="ml-auto flex items-center gap-1 text-[13px] md:text-xs font-normal text-slate-400 dark:text-slate-500"
        >
          {t(theme)}
          <ChevronDown className={`h-4 w-4 md:h-3.5 md:w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div role="listbox" aria-label={t("ariaLabel")} className="mt-0.5 flex flex-col gap-0.5 pl-3">
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={value === theme}
              onClick={() => pick(value)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors md:rounded-lg md:py-1.5 md:text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                value === theme
                  ? "font-medium text-green-700 dark:text-green-400"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>{t(value)}</span>
              {value === theme && <Check className="ml-auto h-4 w-4 md:h-3.5 md:w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
