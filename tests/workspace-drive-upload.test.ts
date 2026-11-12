import test from "node:test";
import assert from "node:assert/strict";
import {runDriveUpload} from "../src/lib/workspace-drive-upload";

test("lost completion response retries confirmation without uploading the file again",async()=>{
 let preparations=0,uploads=0,confirmations=0,uploadedId:string|undefined;
 const prepare=async()=>{preparations++;return{id:"file-1",uploadUrl:"https://storage.example",fields:{key:"file"}};};
 const send=async()=>{uploads++;};
 const complete=async(id:string)=>{assert.equal(id,"file-1");if(++confirmations===1)throw new TypeError("response lost");return {item:{id,kind:"file",status:"ready"}};};
 const remember=(id:string)=>{uploadedId=id;};
 await assert.rejects(runDriveUpload(uploadedId,prepare,send,complete,remember),TypeError);
 assert.equal(uploadedId,"file-1");
 await runDriveUpload(uploadedId,prepare,send,complete,remember);
 assert.deepEqual({preparations,uploads,confirmations},{preparations:1,uploads:1,confirmations:2});
});

test("malformed completion keeps the uploaded id for confirmation without resending bytes",async()=>{
 let uploadedId:string|undefined,uploads=0;
 const prepare=async()=>({id:"file-1",uploadUrl:"https://storage.example",fields:{}});
 const send=async()=>{uploads++;};
 const remember=(id:string)=>{uploadedId=id;};
 for(const result of [null,{}, {item:{id:"other",kind:"file",status:"ready"}},{item:{id:"file-1",kind:"file",status:"pending"}}]){
  await assert.rejects(runDriveUpload(uploadedId,prepare,send,async()=>result,remember),/confirmation/);
  assert.equal(uploadedId,"file-1");
 }
 await runDriveUpload(uploadedId,prepare,send,async()=>({item:{id:"file-1",kind:"file",status:"ready"}}),remember);
 assert.equal(uploads,1);
});

test("an incomplete preparation cannot masquerade as an already uploaded file",async()=>{
 let sent=false;
 await assert.rejects(runDriveUpload(undefined,async()=>({complete:true}) as never,async()=>{sent=true;},async()=>null,()=>{}),/unavailable/);
 assert.equal(sent,false);
});

test("an already completed upload is not sent or confirmed again",async()=>{
 let sent=false,confirmed=false;
 await runDriveUpload(undefined,async()=>({id:"file-1",complete:true}),async()=>{sent=true;},async()=>{confirmed=true;},()=>{throw new Error("unexpected");});
 assert.equal(sent,false);assert.equal(confirmed,false);
});

test("a failed byte transfer does not claim that upload succeeded",async()=>{
 let remembered=false,confirmed=false;
 await assert.rejects(runDriveUpload(undefined,async()=>({id:"file-1",uploadUrl:"https://storage.example",fields:{}}),async()=>{throw new TypeError("offline");},async()=>{confirmed=true;},()=>{remembered=true;}),TypeError);
 assert.equal(remembered,false);assert.equal(confirmed,false);
});
