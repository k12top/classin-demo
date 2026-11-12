import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

test("anonymous course listing never runs lifecycle promotion or database reads",async()=>{
 const file="src/app/api/courses/route.ts";
 // Replace every service boundary; this route test exercises only authentication ordering.
 const stubs:Record<string,unknown>=Object.fromEntries([...readFileSync(file,"utf8").matchAll(/from\s+["'](@\/[^"']+)["']/g)].map(match=>[match[1],{}]));
 let promotions=0,reads=0;
 stubs["@/lib/session"]={getSessionFromRequest:async()=>null};
 stubs["@/lib/course-promote"]={promoteCoursesIfDue:async()=>{promotions++;}};
 stubs["@/lib/db"]={withDatabaseReadRetry:async()=>{reads++;throw Error("Unexpected database work");}};
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>(file,stubs);
 const response=await route.GET(new NextRequest("http://localhost/api/courses"));
 assert.equal(response.status,401);assert.equal(promotions,0);assert.equal(reads,0);
});
