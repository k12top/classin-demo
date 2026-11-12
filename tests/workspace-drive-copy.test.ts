import test from "node:test";
import assert from "node:assert/strict";
import {workspaceDriveCount,workspaceDriveSize,workspaceDriveText,workspaceDriveTrashPrompt} from "../src/components/workspace/workspace-drive-copy";

test("drive labels, counts and destructive confirmation follow the interface language",()=>{
 assert.equal(workspaceDriveText("zh-TW","回收站","Trash"),"回收站");
 assert.equal(workspaceDriveText("vi","回收站","Trash"),"Thùng rác");
 assert.equal(workspaceDriveText("ja","回收站","Trash"),"Trash");
 assert.equal(workspaceDriveCount("en",1),"1 item");assert.equal(workspaceDriveCount("vi",null),"– mục");
 assert.match(workspaceDriveTrashPrompt("vi","lesson",true),/lesson.*thùng rác/);
 assert.match(workspaceDriveTrashPrompt("zh-TW","教材",true),/資料夾/);
});
test("drive file sizes remain meaningful for small and large files",()=>{
 assert.equal(workspaceDriveSize("en",25),"25 B");
 assert.equal(workspaceDriveSize("en",1536),"1.5 KB");
 assert.equal(workspaceDriveSize("en",2.5*1024**2),"2.5 MB");
 assert.equal(workspaceDriveSize("vi",1536),"1,5 KB");
 assert.equal(workspaceDriveSize("en",-1),"–");
});
