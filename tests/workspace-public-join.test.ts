import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

test("public lesson codes require a unique active match",async()=>{
 let rows:{id:string}[]=[],query:Record<string,unknown>={},signedIn=true;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/courses/search-by-passcode/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>signedIn?{userId:"student"}:null},
  "@/lib/db":{prisma:{course:{findMany:async(input:Record<string,unknown>)=>{query=input;return rows;}}}},
  "@/lib/course-status":{CourseStatus:{CANCELLED:"cancelled",FINISHED:"finished"}},
 });
 const request=(code:string)=>new NextRequest(`http://localhost/api/courses/search-by-passcode?passcode=${code}`);
 assert.equal((await route.GET(request("abc"))).status,400);
 assert.equal((await route.GET(request("123456"))).status,404);
 assert.equal(query.take,2);assert.deepEqual(query.select,{id:true});
 rows=[{id:"first"}];let result=await route.GET(request("123456"));assert.equal(result.status,200);assert.deepEqual(await result.json(),{success:true,courseId:"first"});
 rows=[{id:"first"},{id:"second"}];result=await route.GET(request("123456"));assert.equal(result.status,409);const body=await result.json();assert.equal(body.code,"PASSCODE_AMBIGUOUS");assert.equal(body.courseId,undefined);
 signedIn=false;assert.equal((await route.GET(request("123456"))).status,401);
});
