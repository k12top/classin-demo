/** Shared browser/server limit; supplementary-plane characters count once. */
export const CLASSROOM_CHAT_MAX_CHARACTERS = 1200;
export function chatCharacterCount(content: string): number {
  return Array.from(content).length;
}
export function limitChatContent(content: string): string {
  return Array.from(content).slice(0, CLASSROOM_CHAT_MAX_CHARACTERS).join("");
}
