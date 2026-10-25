import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeChatImage } from "../src/lib/classroom/server/chat-image-normalize";
import { isChatImageId, imageMessageContent, parseImageMessage } from "../src/lib/classroom/chat-image-message";
test('chat images normalize to bounded WebP with metadata removed',async()=>{
 const source=await sharp({create:{width:2400,height:1200,channels:3,background:'#336699'}}).jpeg().withMetadata().toBuffer();
 const output=await normalizeChatImage(source),metadata=await sharp(output.data).metadata();assert.equal(metadata.format,'webp');assert.equal(output.width,1920);assert.equal(output.height,960);assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
});
test('chat image processing rejects active content, corrupt bytes and oversized input',async()=>{
 await assert.rejects(normalizeChatImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>')),/static PNG/);
 await assert.rejects(normalizeChatImage(Buffer.from('not an image')),/Invalid image/);await assert.rejects(normalizeChatImage(Buffer.alloc(5*1024*1024+1)),/at most 5/);
});
test('image message references cannot turn into arbitrary URLs or markup',()=>{
 const id='b5d2a04a-2f38-45bf-a673-b07c8797cb10';assert.equal(isChatImageId(id),true);assert.deepEqual(parseImageMessage(imageMessageContent(id,'caption')),{imageId:id,caption:'caption'});assert.equal(parseImageMessage('{"imageId":"https://example.com","caption":"hi"}'),null);assert.equal(parseImageMessage('<script>'),null);
});
