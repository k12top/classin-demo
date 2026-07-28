import { cookies } from "next/headers";
import { getSiteName } from "@/lib/site-brand";
import {
  locales,
  SupportedLocale,
  getTranslation,
  normalizeSupportedLocale,
} from "./locales";

export async function getServerTranslation(lang?: string) {
  let locale: SupportedLocale = "en";

  // URL lang parameter has highest priority (for iframe embed scenarios)
  const urlLocale = normalizeSupportedLocale(lang);
  if (urlLocale) locale = urlLocale;

  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get("NEXT_LOCALE")?.value;
    if (!urlLocale && cookieVal && cookieVal in locales) {
      locale = cookieVal as SupportedLocale;
    }
  } catch (err) {
    // cookies() might throw or fail during static generation or other phases, fallback to default
    console.warn("getServerTranslation failed to read cookies, falling back to en:", err);
  }

  const dict = locales[locale] || locales["en"];
  const fallbackDict = locales["en"];

  const t = (key: string, replacements?: Record<string, string | number>) => {
    let translated = getTranslation(dict, key, replacements);
    if (translated === key) {
      translated = getTranslation(fallbackDict, key, replacements);
    }
    if (key === "common.appName") {
      return getSiteName(translated);
    }
    return translated;
  };

  return {
    locale,
    t,
  };
}
