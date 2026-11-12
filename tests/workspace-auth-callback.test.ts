import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
function callback(options:{profileError?:Error;providerError?:Error}={}){
 let built:unknown,attached=false;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/auth/callback/route.ts",{
  "next/headers":{cookies:async()=>({get:()=>({value:"/?view=calendar"})})},
  "@/lib/casdoor-server":{exchangeCodeForTokens:async()=>{if(options.providerError)throw options.providerError;return{access_token:"provider-token",refresh_token:"rotated-refresh"};},parseJwtPayload:()=>({name:"teacher",displayName:"Test teacher",avatar:"upstream-avatar",roles:["teacher"]}),determineRole:()=>"teacher"},
  "@/lib/casdoor-user":{resolveSessionUserId:()=>"teacher-id"},
  "@/lib/auth-login":{AUTH_RETURN_COOKIE:"return",safeNextPath:(value:string)=>value},
  "@/lib/auth-origin":{classroomAuthOrigin:()=>"http://localhost:3000"},
  "@/lib/user-profile":{resolveUserAvatar:async()=>{if(options.profileError)throw options.profileError;return "custom-avatar";}},
  "@/lib/db":{isTransientDatabaseError:(error:Error)=>/connection timeout/.test(error.message)},
  "@/lib/session":{buildSessionCookies:async(data:unknown,oauth:unknown)=>{built={data,oauth};return{};},attachSessionCookies:()=>{attached=true;}},
 });return{...route,built:()=>built,attached:()=>attached};
}
test("a database timeout for the optional avatar preserves a successful Casdoor login",async()=>{
 const route=callback({profileError:new Error("connection timeout")});const response=await route.GET(new NextRequest("http://localhost:3000/api/auth/callback?code=test"));
 assert.equal(response.status,307);assert.equal(response.headers.get("location"),"http://localhost:3000/?view=calendar");assert.equal(route.attached(),true);
 assert.deepEqual(route.built(),{data:{userId:"teacher-id",name:"teacher",displayName:"Test teacher",avatar:"upstream-avatar",role:"teacher",email:""},oauth:{refreshToken:"rotated-refresh"}});
});
test("failed OAuth exchange never creates a session or leaks internal errors into the redirect",async()=>{
 const route=callback({providerError:new Error("sensitive internal details")});const response=await route.GET(new NextRequest("http://localhost:3000/api/auth/callback?code=test"));
 assert.equal(route.attached(),false);assert.equal(response.headers.get("location"),"http://localhost:3000/login?error=auth_failed");
});
test("non-transient profile failures are reported instead of masking a programming error",async()=>{
 const route=callback({profileError:new Error("schema mismatch")});await route.GET(new NextRequest("http://localhost:3000/api/auth/callback?code=test"));assert.equal(route.attached(),false);
});
