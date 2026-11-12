import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

test("assistant endpoint excludes observers before loading context or calling the model",async()=>{
 let role="observer",contextCalls=0;
 const route=loadModule<typeof import("../src/app/api/sessions/[sessionId]/classroom/assistant/route")>("src/app/api/sessions/[sessionId]/classroom/assistant/route.ts",{
  "@/lib/classroom/server/request-access":{resolveClassroomRequestAccess:async()=>({ok:true,session:{userId:"viewer"},access:{role,courseId:"course",sessionId:"lesson"}})},
  "@/lib/classroom/server/assistant-context":{loadClassroomAssistantContext:async()=>{contextCalls++;return null;}},
  "@/lib/classroom/server/assistant":{createClassroomAssistantHandler:({authorize,context}:{authorize:(request:Request,id:string,share:string)=>Promise<{ok:boolean;status?:number}>;context:()=>Promise<unknown>})=>async(request:Request,id:string)=>{const access=await authorize(request,id,"");if(!access.ok)return Response.json({code:"forbidden"},{status:access.status});await context();return Response.json({ok:true});}},
 });
 const call=()=>route.POST(new NextRequest("https://example.test/assistant",{method:"POST"}),{params:Promise.resolve({sessionId:"lesson"})});
 assert.equal((await call()).status,403);assert.equal(contextCalls,0);
 for(const allowed of ["student","teacher","assistant"]){role=allowed;assert.equal((await call()).status,200);}
 assert.equal(contextCalls,3);role="unknown";assert.equal((await call()).status,403);assert.equal(contextCalls,3);
});
