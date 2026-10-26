import { supportsCaptionTranslation, type CaptionTranslationProvider } from "./translation-capabilities";

export type BridgeTranslationCapabilities = {
  configured: boolean;
  targetLanguages: string[];
  maxTargetLanguages: number;
};

/** Speech recognition stays on Shengwang; route each requested subtitle track. */
export function planCaptionTranslations(
  provider: CaptionTranslationProvider,
  sourceLanguage: string,
  targets: string[],
  bridge: BridgeTranslationCapabilities,
) {
  const shengwangTargets: string[] = [];
  const wordlyTargets: string[] = [];
  const unsupportedTargets: string[] = [];
  for (const code of new Set(targets)) {
    if (code === sourceLanguage) continue;
    if (provider === "shengwang" && supportsCaptionTranslation("shengwang", sourceLanguage) && supportsCaptionTranslation("shengwang", code)) {
      shengwangTargets.push(code);
    } else if (bridge.configured && bridge.targetLanguages.includes(code)) {
      wordlyTargets.push(code);
    } else unsupportedTargets.push(code);
  }
  return {
    shengwangTargets, wordlyTargets, unsupportedTargets,
    exceedsLimit: shengwangTargets.length > 10 || wordlyTargets.length > bridge.maxTargetLanguages,
  };
}

export function isCaptionLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value) && value.length <= 32;
}

/** Keep pending bridge work visible even while capability discovery is down. */
export function requestedBridgeTargets(provider: string, sourceLanguage: string, targets: string[]) {
  return targets.filter(code => code !== sourceLanguage && (provider === "wordly" || !supportsCaptionTranslation("shengwang", code)));
}
