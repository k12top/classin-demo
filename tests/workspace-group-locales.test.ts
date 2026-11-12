import test from "node:test";
import assert from "node:assert/strict";
import {groupCount,groupDeletePrompt,groupRemovePrompt,groupText} from "../src/components/workspace/workspace-group-locales";

test("group management localizes actions, recovery and dynamic confirmations",()=>{
 assert.equal(groupText("vi","添加学生","Add students"),"Thêm học viên");
 assert.equal(groupText("zh-TW","删除分组","Delete group"),"刪除分組");
 assert.equal(groupText("ja","删除分组","Delete group"),"Delete group");
 assert.match(groupText("vi","重试确认","Retry to confirm"),/xác nhận/);
 assert.equal(groupCount("zh-TW",3,"groups"),"共 3 個分組");
 assert.equal(groupCount("vi",2,"selected"),"Xóa đã chọn (2)");
 assert.match(groupRemovePrompt("vi",2,"A"),/2 học viên.*A/);
 assert.equal(groupDeletePrompt("zh-TW","A"),"刪除分組「A」？");
});
