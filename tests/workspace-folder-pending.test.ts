import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingFolder,pendingFolderKey} from "../src/lib/workspace-folder-pending";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";

const body=JSON.stringify({name:"教学资料",parentId:"folder"}),raw=JSON.stringify({requestId:"request-123",body});
test("folder recovery stays scoped to the account and parent folder",()=>{
 assert.notEqual(pendingFolderKey("a","folder"),pendingFolderKey("b","folder"));
 assert.notEqual(pendingFolderKey("a","folder"),pendingFolderKey("a",null));
 assert.deepEqual(parsePendingFolder(raw,"folder"),{requestId:"request-123",body,name:"教学资料"});
 assert.equal(parsePendingFolder(raw,null),null);
 for(const name of ["", " ", "../file", "a\\b", "bad\u0000name"])assert.equal(parsePendingFolder(JSON.stringify({requestId:"request-123",body:JSON.stringify({name,parentId:"folder"})}),"folder"),null);
});
test("folder recovery confirms the exact request after a lost reply",async()=>{
 let attempts=0;const receipts=new Map<string,string>();
 const request=(async(_path:string,options:RequestInit)=>{const key=new Headers(options.headers).get("Idempotency-Key")!,payload=String(options.body);if(receipts.has(key))assert.equal(receipts.get(key),payload);else receipts.set(key,payload);if(++attempts<=2)throw new TypeError("response lost");return {item:{id:"folder"}};}) as typeof workspaceRequest;
 await assert.rejects(retryIdempotentWrite("/drive","POST","request-123",body,request),UncertainWriteError);
 const saved=parsePendingFolder(raw,"folder")!;
 assert.deepEqual(await retryIdempotentWrite("/drive","POST",saved.requestId,saved.body,request),{item:{id:"folder"}});assert.equal(receipts.size,1);
});
