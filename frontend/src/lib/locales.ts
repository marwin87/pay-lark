import enMessages from "../../messages/en.json";
import plMessages from "../../messages/pl.json";
import deMessages from "../../messages/de.json";
import esMessages from "../../messages/es.json";
import itMessages from "../../messages/it.json";
import frMessages from "../../messages/fr.json";
import zhMessages from "../../messages/zh.json";
import nlMessages from "../../messages/nl.json";
import ptMessages from "../../messages/pt.json";
import localeList from "../../messages/locales.json";
import { BRAND } from "./brand";

// Single source of truth for supported languages: messages/locales.json (also read by
// the backend). Adding a language = a messages/<code>.json, an entry in locales.json,
// and the import + map entry below.
// `{brand}` in message strings is replaced with the app name from messages/brand.json.
const withBrand = <T extends object>(m: T): T =>
  JSON.parse(JSON.stringify(m).replaceAll("{brand}", BRAND.name));

export const messagesMap = {
  en: withBrand(enMessages),
  pl: withBrand(plMessages),
  de: withBrand(deMessages),
  es: withBrand(esMessages),
  it: withBrand(itMessages),
  fr: withBrand(frMessages),
  zh: withBrand(zhMessages),
  nl: withBrand(nlMessages),
  pt: withBrand(ptMessages),
};

export type Locale = keyof typeof messagesMap;

export const LOCALE_OPTIONS = localeList as { code: Locale; flag: string; name: string }[];
export const LOCALES: Locale[] = LOCALE_OPTIONS.map((o) => o.code);

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return LOCALES.find((l) => navigator.language.startsWith(l)) ?? "en";
}
