import test from "node:test";
import assert from "node:assert/strict";
import {workspaceCopyForLocale} from "../src/components/workspace/workspace-copy";
import {studentText} from "../src/components/workspace/workspace-student-locales";

test("student details localize messaging, groups and uncertain results",()=>{
 assert.equal(studentText("vi","发消息","Message"),"Nhắn tin");
 assert.equal(studentText("zh-TW","添加至分组","Add to group"),"新增至分組");
 assert.equal(studentText("vi","选择共同班级","Choose a shared class"),"Chọn lớp chung");
 assert.equal(studentText("zh-CN","开始聊天","Start chat"),"开始聊天");
 assert.equal(studentText("en","开始聊天","Start chat"),"Start chat");
 assert.match(studentText("vi","操作未确认","Could not confirm the operation. Refresh before retrying."),/xác nhận/);
});

test("student search describes name, account and group in each supported language",()=>{
 assert.match(workspaceCopyForLocale("zh-CN").searchPeople,/账号/);
 assert.match(workspaceCopyForLocale("zh-TW").searchPeople,/帳號/);
 assert.match(workspaceCopyForLocale("en").searchPeople,/account/);
 assert.match(workspaceCopyForLocale("vi").searchPeople,/tài khoản/);
});
