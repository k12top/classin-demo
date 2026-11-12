import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest,NextResponse} from "next/server";
import {loadModule} from "./helpers/load-module";
import {activityOverviewSummary,emptyActivityQuality} from "../src/lib/classroom/activity-overview";

test("lesson statistics enforce session access and return only compact authorized data",async()=>{
 let allowed=false,reads=0;
 const overview={canManage:false,live:false,activityCount:1,questionCount:1,studentCount:1,participants:1,submissions:1,participation:100,quality:emptyActivityQuality(),accuracy:null,activities:[]};
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{sessionId:string}>}):Promise<Response>}>("src/app/api/sessions/[sessionId]/classroom/activities/route.ts",{
  "@/lib/classroom/server/activity-route":{activityActor:async()=>allowed?{sessionId:"lesson",role:"student"}:NextResponse.json({error:"Forbidden"},{status:403}),activityFailure:()=>new Response(null,{status:500}),activityBody:()=>{}},
  "@/lib/classroom/server/activities":{activityOverview:async()=>{reads++;return overview;},createActivity:()=>{},listActivities:()=>{}},
  "@/lib/classroom/activity-overview":{activityOverviewSummary},
  "@/lib/classroom/signaling/server-publisher":{publishActivityInvalidation:()=>{}},
  "@/lib/db":{prisma:{}},
 });
 const request=()=>new NextRequest("http://localhost/api/sessions/lesson/classroom/activities?overview=summary");
 const context={params:Promise.resolve({sessionId:"lesson"})};
 assert.equal((await route.GET(request(),context)).status,403);assert.equal(reads,0);
 allowed=true;const response=await route.GET(request(),context),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.participants,null);assert.equal(body.accuracy,null);assert.equal("activities" in body,false);
 assert.match(response.headers.get("cache-control")||"",/no-store/);
});
