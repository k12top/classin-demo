"use client";

import { useState } from "react";
import { observeCaptionTranslations, selectLiveCaptions, type CaptionDisplayMode } from "./caption-display";
import type { ClassroomCaptionSnapshot } from "./types";

const EMPTY_CAPTIONS: readonly ClassroomCaptionSnapshot[] = [];

export function useLiveCaptions(
  input: readonly ClassroomCaptionSnapshot[] | undefined,
  language: string,
  mode: CaptionDisplayMode,
  now: number,
) {
  const captions = input ?? EMPTY_CAPTIONS;
  const [observed, setObserved] = useState(() => ({
    captions, language, receivedAt: observeCaptionTranslations(captions, [], language, new Map(), now),
  }));
  let current = observed;
  if (observed.captions !== captions || observed.language !== language) {
    current = {
      captions, language,
      receivedAt: observeCaptionTranslations(captions, observed.language === language ? observed.captions : [], language,
        observed.language === language ? observed.receivedAt : new Map(), now),
    };
    setObserved(current);
  }
  return selectLiveCaptions(captions, language, mode, now, 12_000, current.receivedAt);
}
