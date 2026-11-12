import test from "node:test";
import assert from "node:assert/strict";
import {workspaceTodoCopy,workspaceTodoCount} from "../src/components/workspace/workspace-todo-copy";

test("task actions and recovery messages are available in each supported workspace language",()=>{
 const english=workspaceTodoCopy("en"),keys=Object.keys(english).sort();
 for(const locale of ["zh-CN","zh-TW","vi","en"]){
  const copy=workspaceTodoCopy(locale);
  assert.deepEqual(Object.keys(copy).sort(),keys);
  for(const value of Object.values(copy))assert.ok(value.trim(),`${locale} has an empty label`);
 }
 assert.equal(workspaceTodoCopy("zh-TW").confirmDelete,"確定刪除此任務？");
 assert.equal(workspaceTodoCopy("vi-VN").retryConfirm,"Thử xác nhận lại");
 assert.notEqual(workspaceTodoCopy("vi").uncertainSave,english.uncertainSave);
});


test("task count distinguishes singular and unknown totals",()=>{
 assert.equal(workspaceTodoCount("en",1),"1 item");
 assert.equal(workspaceTodoCount("en",2),"2 items");
 assert.equal(workspaceTodoCount("zh-CN",1),"1 项");
 assert.equal(workspaceTodoCount("vi",null),"–");
});
