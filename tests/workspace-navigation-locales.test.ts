import test from "node:test";
import assert from "node:assert/strict";
import {workspaceCopyForLocale} from "../src/components/workspace/workspace-copy";

test("workspace navigation follows the selected locale and preserves content fallbacks",()=>{
 assert.equal(workspaceCopyForLocale("vi").home,"Trang chủ");
 assert.equal(workspaceCopyForLocale("ja").chat,"チャット");
 assert.equal(workspaceCopyForLocale("zh-TW").calendar,"日曆");
 assert.equal(workspaceCopyForLocale("lo").teacher,"ຄູ");
 assert.equal(workspaceCopyForLocale("vi").createClass,"Tạo lớp");
 assert.equal(workspaceCopyForLocale("zh-TW").createClass,"新增班級");
 assert.equal(workspaceCopyForLocale("vi").observer,"Dự thính");
 assert.equal(workspaceCopyForLocale("vi").autoTranslate,"Tự động dịch tin nhắn");
 assert.equal(workspaceCopyForLocale("zh-TW").autoTranslate,"自動翻譯外語訊息");
 assert.equal(workspaceCopyForLocale("fr").home,"Home");
 assert.equal(workspaceCopyForLocale("zh-CN").home,"首页");
 assert.equal(workspaceCopyForLocale("en"),workspaceCopyForLocale("en"));
});
