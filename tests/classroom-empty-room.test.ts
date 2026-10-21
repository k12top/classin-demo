import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import * as policy from "../src/lib/classroom/empty-room-policy";

type Connection={userId:string;lastSeenAt:Date;leftAt:Date|null};
function fixture(){
 const now=new Date(1_800_000_000_000);const runtime={status:"live",startedAt:new Date(now.getTime()-600_000)};
 const session={status:"live",endedAt:null as Date|null};let events=0;
 let connections:Connection[]=[{userId:"teacher",lastSeenAt:new Date(now.getTime()-500_000),leftAt:new Date(now.getTime()-180_000)}];
 let observation:unknown=null;
 const tx={classroomProviderEvent:{findUnique:async()=>observation,upsert:async({create}:{create:unknown})=>{observation=create;}},$queryRaw:async()=>[],classroomRuntime:{findUnique:async()=>runtime,update:async()=>{runtime.status="ended";}},
  classroomMemberState:{findMany:async()=>[{userId:"teacher"},{userId:"student"}]},
  classroomConnection:{findMany:async({where}:{where:{userId:{in:string[]}}})=>connections.filter(c=>where.userId.in.includes(c.userId))},
  courseSession:{updateMany:async({data}:{data:{status:string;endedAt:Date}})=>{if(session.status!=="live")return {count:0};Object.assign(session,data);return {count:1};}}};
 let tail=Promise.resolve();const prisma={$queryRaw:async()=>[{sessionId:"session"}],classroomRuntime:{findMany:async()=>[{sessionId:"session"}]},$transaction:<T>(fn:(arg:typeof tx)=>Promise<T>)=>{const r=tail.then(()=>fn(tx));tail=r.then(()=>undefined,()=>undefined);return r;}};
 const api=loadModule<typeof import("../src/lib/classroom/server/empty-room")>("src/lib/classroom/server/empty-room.ts",{
  "server-only":{},"@prisma/client":{Prisma:{empty:{}}},"../presence":{CLASSROOM_RECONNECT_WINDOW_MS:120_000},"@/lib/db":{prisma},"@/lib/course-status":{CourseStatus:{LIVE:"live",FINISHED:"finished"}},"../empty-room-policy":{...policy,classroomEmptyGraceMs:()=>180_000},"./integration-events":{enqueueClassroomEvent:async()=>{events++;}},
 });
 return {api,now,runtime,session,prime:()=>api.closeEmptyClassrooms(undefined,new Date(now.getTime()-180_000)),set connections(value:Connection[]){connections=value;},get connections(){return connections;},get events(){return events;}};
}
test("actual server closer ends once after continuous 3 minute absence, even concurrent cron",async()=>{const f=fixture();await f.prime();const results=await Promise.all([f.api.closeEmptyClassrooms(undefined,f.now),f.api.closeEmptyClassrooms(undefined,f.now)]);assert.equal(results.reduce((a,b)=>a+b),1);assert.equal(f.runtime.status,"ended");assert.equal(f.session.status,"finished");assert.equal(f.events,1);});
test("actual server closer cancels deadline for any reconnected tab/device",async()=>{const f=fixture();await f.prime();f.connections.push({userId:"teacher",lastSeenAt:f.now,leftAt:null});assert.equal(await f.api.closeEmptyClassrooms(undefined,f.now),0);assert.equal(f.runtime.status,"live");});
test("a forgotten/closed browser expires reconnect lease then full grace",async()=>{const f=fixture();f.connections=[{userId:"teacher",lastSeenAt:new Date(f.now.getTime()-299_999),leftAt:null}];assert.equal(await f.api.closeEmptyClassrooms(undefined,f.now),0);f.connections[0].lastSeenAt=new Date(f.now.getTime()-300_000);await f.prime();assert.equal(await f.api.closeEmptyClassrooms(undefined,f.now),1);});
test("recorder/RTC bot cannot keep the classroom alive or establish first human attendance",async()=>{const f=fixture();await f.prime();f.connections.push({userId:"recorder",lastSeenAt:f.now,leftAt:null});assert.equal(await f.api.closeEmptyClassrooms(undefined,f.now),1);const untouched=fixture();untouched.connections=[{userId:"recorder",lastSeenAt:untouched.now,leftAt:null}];assert.equal(await untouched.api.closeEmptyClassrooms(undefined,untouched.now),0);});
test("waiting/unstarted or already ended classroom is never auto-closed again",async()=>{for(const status of ["waiting","ended"]){const f=fixture();f.runtime.status=status;assert.equal(await f.api.closeEmptyClassrooms(undefined,f.now),0);assert.equal(f.events,0);}});
