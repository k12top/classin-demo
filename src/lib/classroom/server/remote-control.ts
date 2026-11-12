import 'server-only';
import {ECDH,randomUUID} from 'node:crypto';
import type {ClassroomRemoteControlGrant,Prisma} from '@prisma/client';
import {prisma} from '@/lib/db';
import {casdoorUserIdsMatch} from '@/lib/casdoor-user';
import {getEffectiveSessionRostersSequential} from '@/lib/course-session-roster';
import {normalizeClassroomComposition} from '../composition';
import {mainScreenShareCandidates} from '../screen-share-selection';
import {CLASSROOM_ONLINE_WINDOW_MS} from '../presence';
import {requestRemoteControl,respondRemoteControl,revokeRemoteControl,maySendRemoteInput,mayReceiveRemoteInput,type RemoteControlActor,type RemoteControlEnvironment,type RemoteControlGrant} from '../remote-control';
import {normalizeClassroomClientId} from './connections';
import {classroomRedisEnabled} from './redis';
import {readRemoteControlRedisPresence} from './redis-presence';
import {readClassroomCommand,saveClassroomCommand,validClassroomCommandId} from './command-receipt';
import {classroomSignalingUserId} from '../signaling/identity';

export class RemoteControlServiceError extends Error {constructor(message:string,readonly status:number){super(message);}}
type Identity={userId:string;name?:string};
type Context={sessionId:string;identity:Identity;clientId:string};
function context(input:Context){if(!input.sessionId||!input.identity.userId||!normalizeClassroomClientId(input.clientId))throw new RemoteControlServiceError('Invalid connection',400);}
function fromRow(row:ClassroomRemoteControlGrant):RemoteControlGrant {
 if(!['requested','granted','rejected','revoked'].includes(row.state))throw new RemoteControlServiceError('Invalid stored state',503);
 return {...row,state:row.state as RemoteControlGrant['state'],requestedAt:row.requestedAt.getTime(),expiresAt:row.expiresAt.getTime()};
}
function data(grant:RemoteControlGrant){return {...grant,requestedAt:new Date(grant.requestedAt),expiresAt:new Date(grant.expiresAt)};}
function matches(identity:Identity,id:string){return [identity.userId,identity.name].some(value=>Boolean(value&&casdoorUserIdsMatch(value,id)));}
async function lock(tx:Prisma.TransactionClient,sessionId:string){
 await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
 await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" = ${sessionId} FOR UPDATE`;
 const runtime=await tx.classroomRuntime.findUnique({where:{sessionId},select:{status:true,composition:true}});
 if(!runtime||runtime.status==='ended')throw new RemoteControlServiceError('Classroom unavailable',409);
 const [roster]=await getEffectiveSessionRostersSequential([sessionId],tx);if(!roster)throw new RemoteControlServiceError('Lesson unavailable',404);
 return {runtime,roster};
}
async function connectionLive(tx:Prisma.TransactionClient,sessionId:string,userId:string,clientId:string,now:number,redisLive:boolean|null){
 const row=await tx.classroomConnection.findUnique({where:{id:`${sessionId}:${userId}:${clientId}`},select:{sessionId:true,userId:true,lastSeenAt:true,leftAt:true,replacedAt:true}});
 return Boolean(row&&row.sessionId===sessionId&&row.userId===userId&&!row.leftAt&&!row.replacedAt&&(redisLive===null?(row.lastSeenAt.getTime()<=now&&row.lastSeenAt.getTime()>now-CLASSROOM_ONLINE_WINDOW_MS):redisLive));
}
async function verifiedEnvironment(tx:Prisma.TransactionClient,sessionId:string,teacherId:string,teacherClientId:string,studentId:string,studentClientId:string,claimId:string,now:number,locked:Awaited<ReturnType<typeof lock>>):Promise<RemoteControlEnvironment>{
 const {runtime,roster}=locked;
 const share=mainScreenShareCandidates(normalizeClassroomComposition(runtime.composition).screenShares).find(item=>item.userId===studentId&&item.clientId===studentClientId&&item.claimId===claimId)||null;
 const redisEnabled=classroomRedisEnabled();
 const redisPresence=redisEnabled?await readRemoteControlRedisPresence(sessionId,teacherId,teacherClientId,studentId,studentClientId,CLASSROOM_ONLINE_WINDOW_MS):null;
 const teacherConnected=await connectionLive(tx,sessionId,teacherId,teacherClientId,now,redisEnabled?Boolean(redisPresence?.teacherConnected):null);
 const studentConnected=await connectionLive(tx,sessionId,studentId,studentClientId,now,redisEnabled?Boolean(redisPresence?.studentConnected):null);
 const observer=roster.observers.some(person=>casdoorUserIdsMatch(person.userId,studentId));
 const teacher=roster.teachers.some(person=>casdoorUserIdsMatch(person.userId,teacherId));
 const student=roster.students.some(person=>casdoorUserIdsMatch(person.userId,studentId))&&!roster.teachers.some(person=>casdoorUserIdsMatch(person.userId,studentId));
 return {sessionId,sessionActive:runtime.status!=='ended'&&teacher,teacherConnected,studentConnected,studentRole:student&&!observer?'student':null,share};
}
/** The calling route must pass a server-authenticated identity, never renderer role claims. */
export async function createRemoteControlRequest(input:Context&{studentId:string;claimId:string;commandId:string}){
 context(input);if(!validClassroomCommandId(input.commandId))throw new RemoteControlServiceError('Invalid command identifier',400);return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now(),teaching=locked.roster.teachers.find(person=>matches(input.identity,person.userId));
  if(!teaching||locked.roster.observers.some(person=>matches(input.identity,person.userId)))throw new RemoteControlServiceError('Teaching access required',403);
  const command={sessionId:input.sessionId,actorId:input.identity.userId,clientId:input.clientId,role:teaching.role,commandId:input.commandId,action:{type:'remote-control-request',studentId:input.studentId,claimId:input.claimId}};
  const replay=await readClassroomCommand(tx,command);
  if(replay){const current=typeof replay.grantId==='string'?await tx.classroomRemoteControlGrant.findUnique({where:{id:replay.grantId}}):null;if(!current)throw new RemoteControlServiceError('Original request is no longer current',410);return current;}
  const share=mainScreenShareCandidates(normalizeClassroomComposition(locked.runtime.composition).screenShares).find(item=>item.userId===input.studentId&&item.claimId===input.claimId);
  if(!share)throw new RemoteControlServiceError('Share unavailable',409);
  const environment=await verifiedEnvironment(tx,input.sessionId,input.identity.userId,input.clientId,share.userId,share.clientId,share.claimId,now,locked);
  const existing=await tx.classroomRemoteControlGrant.findUnique({where:{sessionId_studentId:{sessionId:input.sessionId,studentId:share.userId}}});
  if(existing&&(existing.state==='requested'||existing.state==='granted')&&existing.expiresAt.getTime()>now)throw new RemoteControlServiceError('Control request already active',409);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:teaching.role};
  const grant=requestRemoteControl({id:randomUUID(),actor,environment,now});
  const saved=await tx.classroomRemoteControlGrant.upsert({where:{sessionId_studentId:{sessionId:input.sessionId,studentId:share.userId}},create:data(grant),update:{...data(grant),channelPublicKey:null,receiverReady:false}});
  await saveClassroomCommand(tx,command,{grantId:saved.id});return saved;
 },{maxWait:1500,timeout:5000});
}
/** Approval is accepted only from the student's original live sharing connection. */
export async function respondToRemoteControlRequest(input:Context&{grantId:string;accept:boolean;commandId:string}){
 context(input);if(!validClassroomCommandId(input.commandId))throw new RemoteControlServiceError('Invalid command identifier',400);if(typeof input.accept!=='boolean')throw new RemoteControlServiceError('Invalid response',400);
 return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now(),row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||row.studentId!==input.identity.userId)throw new RemoteControlServiceError('Request unavailable',404);
  const command={sessionId:input.sessionId,actorId:input.identity.userId,clientId:input.clientId,role:'student',commandId:input.commandId,action:{type:'remote-control-response',grantId:input.grantId,accept:input.accept}};
  const replay=await readClassroomCommand(tx,command);if(replay)return row;
  const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
  const next=respondRemoteControl(fromRow(row),{userId:input.identity.userId,clientId:input.clientId,role:'student'},environment,input.accept,now);
  const saved=await tx.classroomRemoteControlGrant.update({where:{id:row.id},data:{state:next.state,expiresAt:new Date(next.expiresAt)}});
  await saveClassroomCommand(tx,command,{grantId:saved.id});return saved;
 },{maxWait:1500,timeout:5000});
}
/** Participants can always stop their own grant, including after access expires. */
export async function stopRemoteControl(input:Context&{grantId:string}){
 context(input);return prisma.$transaction(async tx=>{
  const row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||(row.teacherId!==input.identity.userId&&row.studentId!==input.identity.userId))throw new RemoteControlServiceError('Request unavailable',404);
  await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${input.sessionId} FOR UPDATE`;
  const current=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});if(!current)throw new RemoteControlServiceError('Request unavailable',404);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:current.studentId===input.identity.userId?'student':'teacher'};
  const next=revokeRemoteControl(fromRow(current),actor,Date.now());
  return tx.classroomRemoteControlGrant.update({where:{id:current.id},data:{state:next.state,expiresAt:new Date(next.expiresAt),receiverReady:false}});
 },{maxWait:1500,timeout:5000});
}

/** Only the original participant connections can observe their own requests. */
export async function listRemoteControlRequests(input:Context){
 context(input);return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now();
  const teaching=locked.roster.teachers.some(person=>matches(input.identity,person.userId));
  const student=locked.roster.students.some(person=>matches(input.identity,person.userId));
  const observer=locked.roster.observers.some(person=>matches(input.identity,person.userId));
  if(observer||(!teaching&&!student))throw new RemoteControlServiceError('Classroom access required',403);
  const own=teaching?[{teacherId:input.identity.userId,teacherClientId:input.clientId}]:[{studentId:input.identity.userId,studentClientId:input.clientId}];
  const rows=await tx.classroomRemoteControlGrant.findMany({where:{sessionId:input.sessionId,OR:own},orderBy:{requestedAt:'desc'},take:100});
  const results=[];
  for(const row of rows){
   const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
   const live=environment.sessionActive&&environment.teacherConnected&&environment.studentConnected&&environment.studentRole==='student'&&Boolean(environment.share)&&row.expiresAt.getTime()>now;
   results.push({id:row.id,teacherId:row.teacherId,studentId:row.studentId,shareClaimId:row.shareClaimId,state:row.state,effectiveState:(row.state==='requested'||row.state==='granted')&&!live?'inactive':row.state,keyReady:Boolean(row.channelPublicKey),receiverReady:Boolean(live&&row.receiverReady),requestedAt:row.requestedAt,expiresAt:row.expiresAt});
  }
  return results;
 },{maxWait:1500,timeout:5000});
}

/** Resolve an authorization only at the instant a control channel is established.
 * This result is not a durable credential and must not authorize later input on
 * its own: revocation and disconnect still need a receiver-side fence. */
export async function verifyRemoteControlChannel(input:Context&{grantId:string}){
 context(input);return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now();
  const teaching=locked.roster.teachers.find(person=>matches(input.identity,person.userId));
  if(!teaching||locked.roster.observers.some(person=>matches(input.identity,person.userId)))throw new RemoteControlServiceError('Control unavailable',403);
  const row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||row.teacherId!==input.identity.userId||row.teacherClientId!==input.clientId)throw new RemoteControlServiceError('Control unavailable',404);
  const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:teaching.role};
  if(!maySendRemoteInput(fromRow(row),actor,environment,now))throw new RemoteControlServiceError('Control unavailable',409);
  return {grantId:row.id,sessionId:row.sessionId,studentId:row.studentId,studentClientId:row.studentClientId,shareClaimId:row.shareClaimId,expiresAt:row.expiresAt};
 },{maxWait:1500,timeout:5000});
}

/** Bind one P-256 public key to the authorized teacher's exact connection.
 * A replacement key requires a new student-approved grant. */
export async function registerRemoteControlKey(input:Context&{grantId:string;publicKey:string}){
 context(input);
 if(typeof input.grantId!=='string'||!input.grantId||input.grantId.length>200||/[\x00-\x1f]/.test(input.grantId)||typeof input.publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(input.publicKey))throw new RemoteControlServiceError('Invalid control key',400);
 try{const raw=Buffer.from(input.publicKey,'base64url'),validated=ECDH.convertKey(raw,'prime256v1',undefined,undefined,'uncompressed');if(raw.length!==65||raw[0]!==4||raw.toString('base64url')!==input.publicKey||!Buffer.isBuffer(validated)||!validated.equals(raw))throw Error('Invalid point');}catch{throw new RemoteControlServiceError('Invalid control key',400);}
 return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now();
  const teaching=locked.roster.teachers.find(person=>matches(input.identity,person.userId));
  if(!teaching||locked.roster.observers.some(person=>matches(input.identity,person.userId)))throw new RemoteControlServiceError('Control unavailable',403);
  const row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||row.teacherId!==input.identity.userId||row.teacherClientId!==input.clientId)throw new RemoteControlServiceError('Control unavailable',404);
  const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:teaching.role};
  if(!maySendRemoteInput(fromRow(row),actor,environment,now))throw new RemoteControlServiceError('Control unavailable',409);
  if(row.channelPublicKey&&row.channelPublicKey!==input.publicKey)throw new RemoteControlServiceError('Control key already registered',409);
  if(!row.channelPublicKey)await tx.classroomRemoteControlGrant.update({where:{id:row.id},data:{channelPublicKey:input.publicKey}});
  return {grantId:row.id,sessionId:row.sessionId,studentId:row.studentId,studentClientId:row.studentClientId,studentSignalingId:classroomSignalingUserId(`${row.studentId}:${row.studentClientId}`),shareClaimId:row.shareClaimId,publicKey:input.publicKey};
 },{maxWait:1500,timeout:5000});
}

/** A receiver must independently recheck consent; this is not a bearer token. */
export async function verifyRemoteControlReceiver(input:Context&{grantId:string}){
 context(input);if(typeof input.grantId!=='string'||!input.grantId||input.grantId.length>200||/[\x00-\x1f]/.test(input.grantId))throw new RemoteControlServiceError('Invalid grant',400);return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now();
  const row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||row.studentId!==input.identity.userId||row.studentClientId!==input.clientId)throw new RemoteControlServiceError('Control unavailable',404);
  const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:'student'};
  if(!mayReceiveRemoteInput(fromRow(row),actor,environment,now))throw new RemoteControlServiceError('Control unavailable',409);
  return {grantId:row.id,sessionId:row.sessionId,teacherId:row.teacherId,teacherClientId:row.teacherClientId,shareClaimId:row.shareClaimId,publicKey:row.channelPublicKey,leaseMs:Math.min(2000,row.expiresAt.getTime()-now)};
 },{maxWait:1500,timeout:5000});
}

/** Readiness is informational; authorization is still rechecked by the receiver. */
export async function markRemoteControlReceiverReady(input:Context&{grantId:string}){
 context(input);if(typeof input.grantId!=='string'||!input.grantId||input.grantId.length>200||/[\x00-\x1f]/.test(input.grantId))throw new RemoteControlServiceError('Invalid grant',400);
 return prisma.$transaction(async tx=>{
  const locked=await lock(tx,input.sessionId),now=Date.now();
  const row=await tx.classroomRemoteControlGrant.findUnique({where:{id:input.grantId}});
  if(!row||row.sessionId!==input.sessionId||row.studentId!==input.identity.userId||row.studentClientId!==input.clientId)throw new RemoteControlServiceError('Control unavailable',404);
  const environment=await verifiedEnvironment(tx,input.sessionId,row.teacherId,row.teacherClientId,row.studentId,row.studentClientId,row.shareClaimId,now,locked);
  const actor:RemoteControlActor={userId:input.identity.userId,clientId:input.clientId,role:'student'};
  if(!row.channelPublicKey||!mayReceiveRemoteInput(fromRow(row),actor,environment,now))throw new RemoteControlServiceError('Control unavailable',409);
  if(!row.receiverReady)await tx.classroomRemoteControlGrant.update({where:{id:row.id},data:{receiverReady:true}});
  return {grantId:row.id,teacherId:row.teacherId,studentId:row.studentId};
 },{maxWait:1500,timeout:5000});
}
