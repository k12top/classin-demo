export type AgoraSttPayloadInput = {
  channelName: string;
  sourceLanguage: string;
  targetLanguages: string[];
  translationProvider: "shengwang" | "wordly";
  maxIdleSeconds: number;
  subscriberUid: string;
  subscriberToken: string;
  publisherUid: string;
  publisherToken: string;
  taskName: string;
};

export function buildAgoraSttJoinPayload(input: AgoraSttPayloadInput) {
  const payload: Record<string, unknown> = {
    languages: [input.sourceLanguage],
    name: input.taskName,
    maxIdleTime: input.maxIdleSeconds,
    rtcConfig: {
      channelName: input.channelName,
      subBotUid: input.subscriberUid,
      subBotToken: input.subscriberToken,
      pubBotUid: input.publisherUid,
      pubBotToken: input.publisherToken,
    },
  };
  if (
    input.translationProvider === "shengwang" &&
    input.targetLanguages.length > 0
  ) {
    payload.translateConfig = {
      enable: true,
      languages: [
        {
          source: input.sourceLanguage,
          target: input.targetLanguages.slice(0, 10),
        },
      ],
    };
  }
  return payload;
}

export function buildAgoraSttUpdatePayload(input: {
  sourceLanguage: string;
  targetLanguages: string[];
  translationProvider: "shengwang" | "wordly";
}) {
  const translate =
    input.translationProvider === "shengwang" &&
    input.targetLanguages.length > 0;
  return {
    languages: [input.sourceLanguage],
    translateConfig: {
      enable: translate,
      languages: translate
        ? [
            {
              source: input.sourceLanguage,
              target: input.targetLanguages.slice(0, 10),
            },
          ]
        : [],
    },
  };
}
