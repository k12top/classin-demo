import test from "node:test";
import assert from "node:assert/strict";
import {workspaceChatText} from "../src/components/workspace/workspace-chat-copy";

test("chat and private conversation copy follows the interface language",()=>{
 assert.equal(workspaceChatText("zh-CN","开始聊天","Start chat"),"开始聊天");
 assert.equal(workspaceChatText("zh-TW","开始聊天","Start chat"),"開始聊天");
 assert.equal(workspaceChatText("vi-VN","开始聊天","Start chat"),"Bắt đầu trò chuyện");
 assert.equal(workspaceChatText("en","开始聊天","Start chat"),"Start chat");
 assert.equal(workspaceChatText("ja","开始聊天","Start chat"),"Start chat");
});
