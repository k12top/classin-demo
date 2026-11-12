import test from "node:test";
import assert from "node:assert/strict";
import {workspaceChatTranslationCopy} from "../src/components/workspace/workspace-chat-translation-copy";

test("chat translation controls use the selected supported interface language",()=>{
 assert.equal(workspaceChatTranslationCopy("zh-CN").showOriginal,"显示原文");
 assert.equal(workspaceChatTranslationCopy("zh-TW").showOriginal,"顯示原文");
 assert.equal(workspaceChatTranslationCopy("vi-VN").showOriginal,"Xem bản gốc");
 assert.equal(workspaceChatTranslationCopy("en").showOriginal,"Show original");
 assert.equal(workspaceChatTranslationCopy("ja").language,"Translation language");
});
