import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {eventInput,eventRange} from "../src/lib/workspace-event-validation";
import {loadModule} from "./helpers/load-module";
import {retryIdempotentWrite} from "../src/lib/workspace-idempotent-write";
import {parsePendingEvent,pendingEventKey} from "../src/lib/workspace-event-pending";

test("personal events require explicit instants, valid zones and positive bounded duration",()=>{
 const input={title:"  Preparation  ",startsAt:"2026-11-08T15:00:00Z",endsAt:"2026-11-08T16:00:00Z",timeZone:"Asia/Shanghai"};
 assert.equal(eventInput(input).title,"Preparation");
 assert.throws(()=>eventInput({...input,startsAt:"2026-11-08T15:00"}));
 assert.throws(()=>eventInput({...input,timeZone:"not/a-zone"}));
 assert.throws(()=>eventInput({...input,endsAt:input.startsAt}));
 assert.throws(()=>eventRange("2026-01-01T00:00:00Z","2026-12-01T00:00:00Z"));
});
test("personal event updates never cross account or overwrite a newer version",async()=>{
 let where:unknown;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/events/[id]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceEvent:{updateMany:async(args:{where:unknown})=>{where=args.where;return{count:0};},findFirst:async()=>null}}},
  "@/lib/workspace-event-validation":{eventInput},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/events/other",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"x",startsAt:"2026-11-08T15:00:00Z",endsAt:"2026-11-08T16:00:00Z",timeZone:"Asia/Shanghai",version:4,userId:"teacher-b"})}),{params:Promise.resolve({id:"other"})});
 assert.equal(response.status,404);assert.deepEqual(where,{id:"other",userId:"teacher-a",version:4});
});
test("event listing includes intervals overlapping the requested period and scopes the cursor",async()=>{
 let where:unknown;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/workspace/events/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceEvent:{findFirst:async(args:{where:unknown})=>{where=args.where;return null;}}}},
  "@/lib/workspace-event-validation":{eventInput,eventRange},
  "@/lib/workspace-task-validation":{taskRequestId:()=>""},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/events?from=2026-11-01T00%3A00%3A00Z&to=2026-12-01T00%3A00%3A00Z&cursor=foreign"));
 assert.equal(response.status,400);assert.deepEqual(where,{userId:"teacher-a",startsAt:{lt:new Date("2026-12-01T00:00:00Z")},endsAt:{gt:new Date("2026-11-01T00:00:00Z")},id:"foreign"});
});
test("event creation safely confirms the original request after a lost response",async()=>{
 let saved:(ReturnType<typeof eventInput>&{id:string})|undefined,receipt:(ReturnType<typeof eventInput>&{eventId:string})|undefined,writes=0;
 const db={workspaceEvent:{create:async({data}:{data:ReturnType<typeof eventInput>})=>{writes++;saved={...data,id:"event-a"};return saved;},findFirst:async()=>saved},workspaceEventReceipt:{findUnique:async()=>receipt||null,create:async({data}:{data:ReturnType<typeof eventInput>&{eventId:string}})=>{receipt=data;return receipt;}},$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(db)};
 const route=loadModule<{POST(request:NextRequest):Promise<Response> }>("src/app/api/workspace/events/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:db},
  "@/lib/workspace-event-validation":{eventInput,eventRange},
  "@/lib/workspace-task-validation":{taskRequestId:(value:string)=>value},
 });
 const body=JSON.stringify({title:"Preparation",notes:"",startsAt:"2026-11-08T15:00:00Z",endsAt:"2026-11-08T16:00:00Z",timeZone:"Asia/Shanghai"});
 let calls=0;
 const request=async <T>(_path:string,options:RequestInit={})=>{const response=await route.POST(new NextRequest("http://localhost/api/workspace/events",{method:options.method,headers:options.headers,body:String(options.body)}));if(++calls===1)throw new Error("response lost");return await response.json() as T;};
 await retryIdempotentWrite("/api/workspace/events","POST","event-id-123",body,request);
 assert.equal(calls,2);assert.equal(writes,1);assert.equal(saved?.title,"Preparation");
});
test("pending calendar recovery preserves the original instant and isolates accounts",()=>{
 const body=JSON.stringify({title:"DST event",notes:"",startsAt:"2026-11-01T06:30:00.000Z",endsAt:"2026-11-01T07:30:00.000Z",timeZone:"America/New_York"});
 const saved=parsePendingEvent(JSON.stringify({requestId:"event-retry-1",body}));
 assert.equal(saved?.body,body);assert.equal(saved?.input.startsAt.toISOString(),"2026-11-01T06:30:00.000Z");
 assert.notEqual(pendingEventKey("user-a"),pendingEventKey("user-b"));
 assert.equal(parsePendingEvent(JSON.stringify({requestId:"bad",body})),null);
 assert.equal(parsePendingEvent(JSON.stringify({requestId:"event-retry-1",body:"{}"})),null);
});
