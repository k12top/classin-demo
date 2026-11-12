import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAliyunOssClient } from "@/lib/aliyun-oss";
import { getEffectiveSessionRostersSequential } from "@/lib/course-session-roster";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { classroomMayWriteWhiteboard } from "../policy";
import { normalizeClassroomComposition } from "../composition";
import { isChatImageId } from "../chat-image-message";
import { CLASSROOM_ONLINE_WINDOW_MS } from "../presence";
import { ActivityError } from "../activities";
import type { ActivityActor } from "./activities";
import { normalizeClassroomClientId } from "./connections";
import { classroomRedisEnabled } from "./redis";
import { readRemoteControlRedisPresence } from "./redis-presence";
import { normalizeScreenInkImage } from "./screen-ink-image";

type Store = { put(key:string,data:Buffer):Promise<unknown>; delete(key:string):Promise<unknown>; get?(key:string):Promise<Buffer> };
function storage():Store { const client=getAliyunOssClient();return {put:(key,data)=>client.put(key,data,{mime:"image/webp"}),delete:key=>client.delete(key),get:async key=>Buffer.from((await client.get(key)).content)}; }
export async function readScreenInkAsset(key:string,objects?:Store){const client=objects??storage();if(!client.get)throw new Error("Ink storage cannot read");return client.get(key);}
type InkInput={id:string;clientId:string;claimId:string;data:Buffer};
/** Bound the multipart body before parsing, including chunked requests. */
export async function screenInkForm(request:Request) {
 const limit=2*1024*1024+64*1024,length=request.headers.get("content-length");
 if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw new ActivityError("Ink upload is too large",413);
 if(!request.body)throw new ActivityError("Missing ink image",400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ActivityError("Ink upload is too large",413);}chunks.push(value);}}finally{reader.releaseLock();}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:Buffer.concat(chunks)}).formData();}catch{throw new ActivityError("Invalid ink upload",400);}
}
/** Uploads remain private. The transaction rechecks the active share before recording. */
export async function saveScreenInkAsset(actor:ActivityActor,input:InkInput,objects?:Store) {
 const clientId=normalizeClassroomClientId(input.clientId);
 if(!isChatImageId(input.id)||!clientId||!isChatImageId(input.claimId))throw new ActivityError("Invalid ink request",400);
 if(!["teacher","assistant","student"].includes(actor.role))throw new ActivityError("Ink is not permitted",403);
 const hash=createHash("sha256").update(input.data).digest("hex");
 const same=(row:{sessionId:string;uploaderId:string;clientId:string;claimId:string;sourceHash:string})=>row.sessionId===actor.sessionId&&row.uploaderId===actor.userId&&row.clientId===clientId&&row.claimId===input.claimId&&row.sourceHash===hash;
 const existing=await prisma.classroomScreenInkAsset.findUnique({where:{id:input.id}});
 if(existing){if(!same(existing))throw new ActivityError("Ink upload ID conflict",409);return existing;}
 const prepared=await normalizeScreenInkImage(input.data),store=objects??storage();
 const objectKey=`classroom-ink/${actor.sessionId}/${input.id}/${randomUUID()}.webp`;
 await store.put(objectKey,prepared.data);
 try {
  return await prisma.$transaction(async(tx:Prisma.TransactionClient)=>{
   await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${actor.sessionId} FOR UPDATE`;
   await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" = ${actor.sessionId} FOR UPDATE`;
   const [runtime,member,connection,prior]=await Promise.all([
    tx.classroomRuntime.findUnique({where:{sessionId:actor.sessionId},select:{status:true,composition:true}}),
    tx.classroomMemberState.findUnique({where:{sessionId_userId:{sessionId:actor.sessionId,userId:actor.userId}},select:{whiteboardWritable:true,role:true}}),
    tx.classroomConnection.findUnique({where:{id:`${actor.sessionId}:${actor.userId}:${clientId}`},select:{leftAt:true,replacedAt:true,lastSeenAt:true}}),
    tx.classroomScreenInkAsset.findUnique({where:{id:input.id}}),
   ]);
   if(prior){if(!same(prior))throw new ActivityError("Ink upload ID conflict",409);return prior;}
   const shares=normalizeClassroomComposition(runtime?.composition).screenShares??{};
   const [roster]=await getEffectiveSessionRostersSequential([actor.sessionId],tx);
   const enrolled=actor.role==="student"?Boolean(roster?.students.some(person=>casdoorUserIdsMatch(person.userId,actor.userId))&&!roster?.observers.some(person=>casdoorUserIdsMatch(person.userId,actor.userId))):Boolean(roster?.teachers.some(person=>person.role===actor.role&&casdoorUserIdsMatch(person.userId,actor.userId)));
   const ownsShare=Object.values(shares).some(lease=>lease.userId===actor.userId&&lease.clientId===clientId&&lease.claimId===input.claimId);
   const redis=classroomRedisEnabled()?await readRemoteControlRedisPresence(actor.sessionId,actor.userId,clientId,actor.userId,clientId,CLASSROOM_ONLINE_WINDOW_MS):null;
   const now=Date.now(),online=classroomRedisEnabled()?Boolean(redis?.teacherConnected):Boolean(connection&&connection.lastSeenAt.getTime()<=now&&now-connection.lastSeenAt.getTime()<CLASSROOM_ONLINE_WINDOW_MS);
   if(!runtime||runtime.status==='ended'||!enrolled||!member||member.role!==actor.role||!classroomMayWriteWhiteboard(actor.role,member.whiteboardWritable)||!connection||connection.leftAt||connection.replacedAt||!online||!ownsShare)throw new ActivityError("Screen share or drawing permission expired",403);
   const count=await tx.classroomScreenInkAsset.count({where:{sessionId:actor.sessionId,uploaderId:actor.userId,createdAt:{gt:new Date(now-60000)}}});
   if(count>=120)throw new ActivityError("Too many ink uploads",429);
   return tx.classroomScreenInkAsset.create({data:{id:input.id,sessionId:actor.sessionId,uploaderId:actor.userId,clientId,claimId:input.claimId,objectKey,sourceHash:hash,bytes:prepared.data.length,width:prepared.width,height:prepared.height}});
  },{maxWait:1500,timeout:5000}).then(async row=>{if(row.objectKey!==objectKey)await store.delete(objectKey).catch(()=>undefined);return row;});
 } catch(error) {
  // Do not delete on an unknown commit outcome unless the DB confirms this
  // particular object is not referenced by the committed row.
  try{const saved=await prisma.classroomScreenInkAsset.findUnique({where:{id:input.id}});if(!saved||saved.objectKey!==objectKey)await store.delete(objectKey);}catch{/* Preserve the object if commit status cannot be checked. */}
  throw error;
 }
}
