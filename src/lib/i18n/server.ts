import { cookies } from "next/headers";
import { locales, SupportedLocale, getTranslation } from "./locales";

export async function getServerTranslation(lang?: string) {
  let locale: SupportedLocale = "en";

  // URL lang parameter has highest priority (for iframe embed scenarios)
  if (lang && lang in locales) {
    locale = lang as SupportedLocale;
  }

  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieVal && cookieVal in locales) {
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
    return translated;
  };

  return {
    locale,
    t,
  };
}
