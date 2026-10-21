import { zhCN } from "../../src/lib/i18n/locales/zh-CN";

export function useTranslation() {
  return {
    locale: "zh-CN",
    t: (key: string) => key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, zhCN) || key,
  };
}
