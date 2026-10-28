export function shouldReusePersistedCaption(input: {
  existingIsFinal: boolean;
  existingText: string;
  existingTranslations: Record<string, string>;
  incomingIsFinal: boolean;
  incomingText: string;
  incomingTranslations: Record<string, string>;
  provider: "shengwang" | "wordly";
  targetLanguages: readonly string[];
}): boolean {
  if (!input.existingIsFinal) {
    return !input.incomingIsFinal && input.existingText === input.incomingText &&
      !Object.entries(input.incomingTranslations).some(([language, text]) => input.existingTranslations[language] !== text);
  }
  if (!input.incomingIsFinal) return true;
  if (input.existingText !== input.incomingText) return false;

  if (input.provider === "wordly") {
    return input.targetLanguages.every((language) =>
      Boolean(input.existingTranslations[language]),
    ) && !Object.entries(input.incomingTranslations).some(
      ([language, translation]) => input.existingTranslations[language] !== translation,
    );
  }

  return !Object.entries(input.incomingTranslations).some(
    ([language, translation]) =>
      input.existingTranslations[language] !== translation,
  );
}
