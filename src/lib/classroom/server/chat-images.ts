import "server-only";
import { createHash } from "node:crypto";
import { normalizeChatImage } from "./chat-image-normalize";
export { normalizeChatImage } from "./chat-image-normalize";
import { prisma } from "@/lib/db";
import { getAliyunOssClient } from "@/lib/aliyun-oss";
import { ActivityError } from "../activities";
import type { ActivityActor } from "./activities";
import { CLASSROOM_IMAGE_MAX_BYTES, isChatImageId } from "../chat-image-message";


type Storage={put:(key:string,data:Buffer)=>Promise<unknown>;get:(key:string)=>Promise<Buffer>;delete:(key:string)=>Promise<unknown>};
function storage():Storage{const client=getAliyunOssClient();return {put:(key,data)=>client.put(key,data,{mime:'image/webp'}),get:async key=>Buffer.from((await client.get(key)).content),delete:key=>client.delete(key)}}
export async function saveChatImage(actor:ActivityActor,id:string,input:Buffer,objects?:Storage){
 if(!isChatImageId(id))throw new ActivityError('Invalid upload ID');
 const hash=createHash('sha256').update(input).digest('hex');
 const prior=await prisma.classroomChatImage.findUnique({where:{id}});
 const same=(row:NonNullable<typeof prior>)=>row.sessionId===actor.sessionId&&row.uploaderId===actor.userId&&row.sourceHash===hash;
 if(prior){if(!same(prior))throw new ActivityError('Upload ID already belongs to another image',409);return prior}
 const [runtime,member,lesson,count]=await Promise.all([
  prisma.classroomRuntime.findUnique({where:{sessionId:actor.sessionId},select:{status:true,chatEnabled:true}}),
  prisma.classroomMemberState.findUnique({where:{sessionId_userId:{sessionId:actor.sessionId,userId:actor.userId}},select:{chatMuted:true}}),
  prisma.courseSession.findUnique({where:{id:actor.sessionId},select:{endedAt:true,status:true}}),
  prisma.classroomChatImage.count({where:{sessionId:actor.sessionId,uploaderId:actor.userId,createdAt:{gt:new Date(Date.now()-60000)}}}),
 ]);
 if(!runtime||!lesson||runtime.status==='ended'||lesson.endedAt||['finished','cancelled'].includes(lesson.status))throw new ActivityError('Lesson has ended',409);
 if(actor.role==='student'&&(!member||member.chatMuted||!runtime.chatEnabled))throw new ActivityError('Chat is not allowed',403);
 if(count>=12)throw new ActivityError('Please wait before uploading more images',429);
 const prepared=await normalizeChatImage(input),key=`classroom-chat/${actor.sessionId}/${id}/${hash.slice(0,24)}.webp`,client=objects??storage();
 await client.put(key,prepared.data);
 try{return await prisma.classroomChatImage.create({data:{id,sessionId:actor.sessionId,uploaderId:actor.userId,objectKey:key,sourceHash:hash,contentType:'image/webp',bytes:prepared.data.length,width:prepared.width,height:prepared.height}})}catch(error){
  const saved=await prisma.classroomChatImage.findUnique({where:{id}});if(saved&&same(saved))return saved;
  await client.delete(key).catch(()=>undefined);throw error;
 }
}
export async function readChatImageObject(key:string,objects?:Storage){return (objects??storage()).get(key)}

/** A bounded multipart body, including requests without Content-Length. */
export async function chatImageForm(request:Request){
 const limit=CLASSROOM_IMAGE_MAX_BYTES+64*1024;
 if(Number(request.headers.get('content-length'))>limit)throw new ActivityError('Image is too large',413);
 if(!request.body)throw new ActivityError('Missing image');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ActivityError('Image is too large',413)}chunks.push(value)}}finally{reader.releaseLock()}
 try{return await new Request(request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)}).formData()}catch{throw new ActivityError('Invalid image upload')}
}
