import "server-only";
import { planCaptionTranslations } from "../caption-routing";
import { supportsCaptionTranslation, type CaptionTranslationProvider } from "../translation-capabilities";
import { wordlyTranslationCapabilities } from "@/lib/classroom/translation/wordly";

export async function resolveCaptionTranslations(provider: CaptionTranslationProvider, sourceLanguage: string, targets: string[]) {
  const needsBridge = provider === "wordly" || targets.some(code => code !== sourceLanguage && !supportsCaptionTranslation("shengwang", code));
  const bridge = needsBridge ? await wordlyTranslationCapabilities() : { configured: false, targetLanguages: [], maxTargetLanguages: 0 };
  return planCaptionTranslations(provider, sourceLanguage, targets, bridge);
}

