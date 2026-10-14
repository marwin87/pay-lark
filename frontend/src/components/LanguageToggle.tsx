"use client";

import { useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "@/context/locale-context";
import { LOCALE_OPTIONS } from "@/lib/locales";
import { MENU_ROW_CLASS } from "@/components/menuRow";

/** Menu row that expands in place into the user's enabled languages. Stays open after a pick. */
export default function LanguageToggle() {
  const t = useTranslations("LanguageToggle");
  const { locale, setLocale, enabledLocales } = useLocale();
  const [open, setOpen] = useState(false);

  const options = LOCALE_OPTIONS.filter(({ code }) => enabledLocales.includes(code));
  const current = LOCALE_OPTIONS.find((l) => l.code === locale);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("ariaLabel")}
        className={MENU_ROW_CLASS}
      >
        <Languages className="h-[20px] w-[20px] shrink-0 md:h-[17px] md:w-[17px]" />
        <span>{t("title")}</span>
        <span className="ml-auto flex items-center gap-1 text-[13px] md:text-xs font-normal text-slate-400 dark:text-slate-500">
          {current?.flag} {current?.name}
          <ChevronDown className={`h-4 w-4 md:h-3.5 md:w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div role="listbox" aria-label={t("ariaLabel")} className="mt-0.5 flex flex-col gap-0.5 pl-3">
          {options.map(({ code: value, flag, name }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={value === locale}
              onClick={() => setLocale(value)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors md:rounded-lg md:py-1.5 md:text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                value === locale
                  ? "font-medium text-green-700 dark:text-green-400"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>{flag}</span>
              <span>{name}</span>
              {value === locale && <Check className="ml-auto h-4 w-4 md:h-3.5 md:w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
