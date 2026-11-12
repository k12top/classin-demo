import test from "node:test";
import assert from "node:assert/strict";
import {driveUploadKey,listPendingDriveUploads,parsePendingDriveUpload} from "../src/lib/workspace-drive-upload-recovery";

test("upload recovery only reads valid records belonging to the active account",()=>{
 const values=new Map<string,string>();
 const storage={get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,getItem:(key:string)=>values.get(key)??null} as Storage;
 const record={requestId:"request-1",uploadedId:"file-1",name:"lesson.mp4",parentId:null};
 values.set(driveUploadKey("teacher-a",record.requestId),JSON.stringify(record));
 values.set(driveUploadKey("teacher-b","request-2"),JSON.stringify({...record,requestId:"request-2"}));
 values.set(driveUploadKey("teacher-a","request-3"),JSON.stringify({...record,requestId:"request-4"}));
 assert.deepEqual(listPendingDriveUploads(storage,"teacher-a"),[record]);
 assert.deepEqual(listPendingDriveUploads(storage,"teacher-b"),[{...record,requestId:"request-2"}]);
});

test("upload recovery rejects malformed or incomplete local records",()=>{
 assert.equal(parsePendingDriveUpload(null),null);
 assert.equal(parsePendingDriveUpload("{"),null);
 assert.equal(parsePendingDriveUpload(JSON.stringify({requestId:"request-1",uploadedId:"",name:"file",parentId:null})),null);
 assert.equal(parsePendingDriveUpload(JSON.stringify({requestId:"request-1",uploadedId:"file",name:"file",parentId:{}})),null);
});
