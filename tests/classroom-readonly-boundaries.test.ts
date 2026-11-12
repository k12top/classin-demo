import test from "node:test";
import assert from "node:assert/strict";
import {classroomMayPublish,classroomMayWriteWhiteboard,classroomRoleMayAct,isSupportedClassroomMember} from "../src/lib/classroom/policy";
import {classroomMessageAccess} from "../src/lib/classroom/server/message-access";
import {credentialCanPublish,type ClassroomRole} from "../src/lib/classroom/types";
import {loadModule} from "./helpers/load-module";
import {NextRequest} from "next/server";

const observer:ClassroomRole="observer";
test("runtime members retain observer identity and reject unknown roles",()=>{
 const members=["teacher","assistant","student","observer","unknown",""].map(role=>({role}));
 assert.deepEqual(members.filter(isSupportedClassroomMember).map(member=>member.role),["teacher","assistant","student","observer"]);
});
test("observer actions are read-only except for presence heartbeat",()=>{
 for(const action of ["startClass","raiseHand","lowerHand","startScreenShare","releaseScreenShare","inviteStage","setStage","giveReward","setChatEnabled"])assert.equal(classroomRoleMayAct("observer",action),false);
 assert.equal(classroomRoleMayAct("observer","heartbeat"),true);
 assert.equal(classroomRoleMayAct("student","raiseHand"),true);
 assert.equal(classroomRoleMayAct("teacher","startClass"),true);
});
class AccessError extends Error {constructor(message:string,public status=400){super(message);}}
test("unrecognized or read-only roles never gain RTC publishing or staff messages",()=>{
 for(const role of ["observer","unknown",""]){assert.equal(classroomMayPublish(role,true),false);assert.deepEqual(classroomMessageAccess("lesson","viewer",role),{sessionId:"lesson",scope:"classroom"});}
 assert.equal(classroomMayPublish("teacher"),true);assert.equal(classroomMayPublish("assistant"),true);assert.equal(classroomMayPublish("student"),false);assert.equal(classroomMayPublish("student",true),true);
 assert.ok(JSON.stringify(classroomMessageAccess("lesson","teacher","teacher")).includes('"scope":"staff"'));
 for(const role of ["observer","unknown",""])assert.equal(classroomMayWriteWhiteboard(role,true),false);
 assert.equal(credentialCanPublish({role:observer,publishAllowed:true}),false);
 assert.equal(credentialCanPublish({role:"student",publishAllowed:true}),true);
 assert.equal(classroomMayWriteWhiteboard("student",false),false);assert.equal(classroomMayWriteWhiteboard("student",true),true);assert.equal(classroomMayWriteWhiteboard("assistant",false),true);
});
test("the Agora credential issuer enforces subscriber role even if publishing is requested",()=>{
 const roles:number[]=[];
 const provider=loadModule<typeof import("../src/lib/classroom/providers/agora/server")>("src/lib/classroom/providers/agora/server.ts",{
  "server-only":{},"agora-token":{RtcRole:{PUBLISHER:1,SUBSCRIBER:2},RtcTokenBuilder:{buildTokenWithUid:(_id:string,_key:string,_channel:string,_uid:number,role:number)=>{roles.push(role);return "test-token";}}},
  "@/lib/classroom/config":{classroomRuntimeDefaults:{rtcTokenTtlSeconds:3600}},"@/lib/classroom/screen-share":{},"@/lib/classroom/rtc-uid":{classroomRtcUid:()=>123,classroomAuxiliaryRtcUid:()=>456},"@/lib/classroom/server/errors":{},"@/lib/classroom/recording-storage":{},"@/lib/aliyun-oss":{},"@/lib/classroom/recording-reconciliation":{},"@/lib/classroom/policy":{classroomMayPublish},
 },{process:{env:{AGORA_APP_ID:"test-app",AGORA_APP_CERTIFICATE:"test-cert"}}});
 const credential=new provider.AgoraClassroomServerProvider().issueCredential({channelName:"lesson",userId:"viewer",role:observer,publisher:true,allowScreenShare:true});
 assert.equal(credential.publishAllowed,false);assert.equal(credential.screenShare,undefined);assert.deepEqual(roles,[2]);
});
test("whiteboard token remains reader for a read-only role with a stale write grant",async()=>{
 const issued:string[]=[];
 const provider=loadModule<typeof import("../src/lib/classroom/whiteboard/netless-server")>("src/lib/classroom/whiteboard/netless-server.ts",{
  "server-only":{},"@/lib/classroom/server/runtime":{ensureClassroomRuntime:async()=>({whiteboardRoomUuid:"room"})},"@/lib/classroom/whiteboard/retry":{retryWhiteboardRequest:async(fn:()=>Promise<unknown>)=>fn()},"@/lib/db":{prisma:{}},"@/lib/classroom/policy":{classroomMayWriteWhiteboard},
 },{process:{env:{WHITEBOARD_APP_IDENTIFIER:"app",WHITEBOARD_SDK_TOKEN:"token",WHITEBOARD_REGION:"sg"}},fetch:async(_url:string,init:RequestInit)=>{issued.push(JSON.parse(String(init.body)).role);return {ok:true,text:async()=>JSON.stringify("NETLESSROOM_test")};}});
 const board=new provider.NetlessWhiteboardProvider();
 const credential=await board.issueJoinCredential({courseId:"c",sessionId:"s",userId:"viewer",role:observer,writable:true});
 assert.equal(credential.writable,false);assert.deepEqual(issued,["reader"]);
});
test("unconfigured whiteboard returns a stable non-secret status",async()=>{
 const provider=loadModule<typeof import("../src/lib/classroom/whiteboard/netless-server")>("src/lib/classroom/whiteboard/netless-server.ts",{
  "server-only":{},"@/lib/classroom/server/runtime":{},"@/lib/classroom/whiteboard/retry":{},"@/lib/db":{prisma:{}},"@/lib/classroom/policy":{classroomMayWriteWhiteboard},
 },{process:{env:{}}});
 const credential=await new provider.NetlessWhiteboardProvider().issueJoinCredential({courseId:"c",sessionId:"s",userId:"u",role:"teacher",writable:true});
 assert.equal(credential.enabled,false);assert.equal(credential.error,"whiteboard_not_configured");assert.equal(credential.writable,false);
});
test("a read-only role cannot create or manage questions before any database access",async()=>{
 let touched=false;
 const questions=loadModule<typeof import("../src/lib/classroom/server/questions")>("src/lib/classroom/server/questions.ts",{"server-only":{},"@/lib/classroom/mode":{},"@/lib/classroom/server/runtime":{},"@/lib/db":{prisma:new Proxy({},{get(){touched=true;throw new Error("unexpected database access");}})}});
 await assert.rejects(questions.createClassroomQuestion({courseId:"c",sessionId:"s",askerId:"u",askerName:"U",role:observer,content:"test"}),{status:403});
 await assert.rejects(questions.updateClassroomQuestion({courseId:"c",sessionId:"s",actorId:"u",role:observer,questionId:"q",action:"dismiss"}),{status:403});
 assert.equal(touched,false);
});
test("observer question reads cannot recover private questions from an earlier identity",async()=>{
 let where:unknown;
 const service=loadModule<typeof import("../src/lib/classroom/server/questions")>("src/lib/classroom/server/questions.ts",{"server-only":{},"@/lib/classroom/mode":{},"@/lib/classroom/server/runtime":{},"@/lib/db":{prisma:{classroomQuestion:{findMany:async(input:{where:unknown})=>{where=input.where;return [];}}}}});
 await service.getClassroomQuestions({courseId:"c",sessionId:"s",viewerId:"viewer",role:observer});
 assert.deepEqual(where,{sessionId:"s",status:{in:["promoted","answered"]}});
 await service.getClassroomQuestions({courseId:"c",sessionId:"s",viewerId:"viewer",role:"student"});
 assert.deepEqual(where,{sessionId:"s",OR:[{askerId:"viewer"},{status:{in:["promoted","answered"]}}]});
});
test("a read-only role cannot moderate microphones or create interactive activities",async()=>{
 let touched=false;const db=new Proxy({},{get(){touched=true;throw new Error("unexpected database access");}});
 const permissions=loadModule<typeof import("../src/lib/classroom/server/member-permissions")>("src/lib/classroom/server/member-permissions.ts",{"server-only":{},"./command-receipt":{},"@/lib/db":{prisma:db},"./runtime":{ClassroomActionError:AccessError},"../mode":{},"../stage-settings":{},"./redis-presence":{}});
 await assert.rejects(permissions.applyClassroomMemberPermissions({courseId:"c",sessionId:"s",actorId:"u",role:observer,action:{type:"muteAllMicrophones"}}),{status:403});
 const activities=loadModule<typeof import("../src/lib/classroom/server/activities")>("src/lib/classroom/server/activities.ts",{"server-only":{},"../caption-start-preferences":{},"@/lib/course-session-roster":{},"@/lib/course-teacher":{},"@/lib/db":{prisma:db},"../activity-overview":{},"@/lib/classroom/activities":{ActivityError:AccessError}});
 await assert.rejects(activities.createActivity({courseId:"c",sessionId:"s",userId:"u",displayName:"U",role:observer},{},"request-123"),{status:403});
 assert.equal(touched,false);
});
test("read-only users never enter student breakout assignment",async()=>{
 let touched=false;const db=new Proxy({},{get(){touched=true;throw new Error("unexpected database access");}});
 const spaces=loadModule<typeof import("../src/lib/classroom/server/spaces")>("src/lib/classroom/server/spaces.ts",{"server-only":{},"@/lib/classroom/mode":{},"@/lib/classroom/server/runtime":{},"@/lib/db":{prisma:db},"@/lib/classroom/space-planner":{},"@/lib/course-session-roster":{}});
 assert.equal(await spaces.ensureClassroomSpaceAssignment({courseId:"c",sessionId:"s",userId:"viewer",displayName:"Viewer",avatar:"",role:observer}),null);
 assert.deepEqual(await spaces.getClassroomSpaces({courseId:"c",sessionId:"s",viewerId:"viewer",role:observer}),[]);
 await assert.rejects(spaces.getClassroomSpaceCredentialAccess({courseId:"c",sessionId:"s",spaceId:"old-room",viewerId:"viewer",role:observer}),{status:403});
 assert.equal(touched,false);
});
test("a read-only role cannot send messages or upload images",async()=>{
 let touched=false;const db=new Proxy({},{get(){touched=true;throw new Error("unexpected database access");}});
 const messages=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/classroom/messages/route.ts",{
  "@/lib/classroom/chat-content":{CLASSROOM_CHAT_MAX_CHARACTERS:1200,chatCharacterCount:(s:string)=>s.length},"@/lib/classroom/chat-image-message":{isChatImageId:()=>false},"@/lib/classroom/server/message-access":{},"@/lib/classroom/server/redis":{},"@/lib/classroom/server/management":{},"@/lib/classroom/server/runtime":{},"@/lib/classroom/server/request-access":{resolveClassroomRequestAccess:async()=>({ok:true,session:{userId:"u"},access:{role:observer,courseId:"c",sessionId:"s"}})},"@/lib/db":{prisma:db},"@/lib/database-response":{databaseUnavailableResponse:()=>null},"@/lib/classroom/server/message-id":{isClassroomClientMessageId:()=>true},
 });
 const response=await messages.POST(new NextRequest("http://localhost/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:"hello"})}),{params:Promise.resolve({id:"c"})});assert.equal(response.status,403);
 const images=loadModule<typeof import("../src/lib/classroom/server/chat-images")>("src/lib/classroom/server/chat-images.ts",{"server-only":{},"./chat-image-normalize":{},"@/lib/db":{prisma:db},"@/lib/aliyun-oss":{},"../activities":{ActivityError:AccessError},"../chat-image-message":{}});
 await assert.rejects(images.saveChatImage({courseId:"c",sessionId:"s",userId:"u",displayName:"U",role:observer},"image",Buffer.from("test")),{status:403});assert.equal(touched,false);
});
test("observer and student cannot archive captions while teacher can",async()=>{
 let role:ClassroomRole="observer",writes=0;
 const captions=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/classroom/captions/route.ts",{
  "@/lib/classroom/server/captions":{ingestClassroomCaption:async()=>{writes++;return {ok:true};}},
  "@/lib/classroom/server/request-access":{resolveClassroomRequestAccess:async()=>({ok:true,session:{userId:"viewer"},access:{role,courseId:"c",sessionId:"s"}})},
  "@/lib/classroom/server/recorder-token":{verifyRecorderToken:async()=>false},"@/lib/db":{prisma:{}},"@/lib/database-response":{databaseUnavailableResponse:()=>null},
 });
 const request=()=>new NextRequest("http://localhost/captions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({caption:{id:"x",text:"hello",speakerId:"a",isFinal:true}})}),ctx={params:Promise.resolve({id:"s"})};
 assert.equal((await captions.POST(request(),ctx)).status,403);role="student";assert.equal((await captions.POST(request(),ctx)).status,403);assert.equal(writes,0);
 role="teacher";assert.equal((await captions.POST(request(),ctx)).status,200);assert.equal(writes,1);
});
