import { CLASSROOM_CHAT_MAX_CHARACTERS, chatCharacterCount } from "./chat-content";
export const CLASSROOM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export function isChatImageId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function imageMessageContent(imageId: string, caption: string) { return JSON.stringify({ imageId, caption }); }
export function parseImageMessage(content: string): { imageId: string; caption: string } | null { try { const value=JSON.parse(content);return isChatImageId(value.imageId)&&typeof value.caption==='string'&&chatCharacterCount(value.caption)<=CLASSROOM_CHAT_MAX_CHARACTERS?{imageId:value.imageId,caption:value.caption}:null } catch { return null } }
