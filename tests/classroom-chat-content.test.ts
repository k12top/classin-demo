import test from "node:test";
import assert from "node:assert/strict";
import { CLASSROOM_CHAT_MAX_CHARACTERS, chatCharacterCount, limitChatContent } from "../src/lib/classroom/chat-content";
import { imageMessageContent, parseImageMessage } from "../src/lib/classroom/chat-image-message";

test("chat limit counts supplementary characters once and never splits a surrogate pair", () => {
  const text = "字".repeat(1199) + "😀";
  assert.equal(chatCharacterCount(text), CLASSROOM_CHAT_MAX_CHARACTERS);
  assert.equal(limitChatContent(text + "尾"), text);
  assert.equal(chatCharacterCount(" \n😀"), 3);
});

test("image captions accept the same 1200-character boundary as plain chat", () => {
  const imageId = "b5d2a04a-2f38-45bf-a673-b07c8797cb10";
  const caption = "😀".repeat(1200);
  assert.deepEqual(parseImageMessage(imageMessageContent(imageId, caption)), { imageId, caption });
  assert.equal(parseImageMessage(imageMessageContent(imageId, caption + "字")), null);
});
