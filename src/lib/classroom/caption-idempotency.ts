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
  if (!input.existingIsFinal) return false;
  if (!input.incomingIsFinal) return true;
  if (input.existingText !== input.incomingText) return false;

  if (input.provider === "wordly") {
    return input.targetLanguages.every((language) =>
      Boolean(input.existingTranslations[language]),
    );
  }

  return !Object.entries(input.incomingTranslations).some(
    ([language, translation]) =>
      input.existingTranslations[language] !== translation,
  );
}
