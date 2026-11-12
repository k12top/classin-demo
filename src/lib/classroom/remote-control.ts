import type {ClassroomScreenShareLease} from './types';

/** A control grant never outlives the sharing connection it was created for. */
export const REMOTE_CONTROL_REQUEST_TTL_MS=60_000;
// Keep a single consent usable for an extended lesson. The much shorter
// receiver lease still requires the original live share and both connections.
export const REMOTE_CONTROL_GRANT_TTL_MS=8*60*60_000;
export type RemoteControlActor={userId:string;clientId:string;role:'teacher'|'assistant'|'student'|'observer'};
/** Values must be derived from the locked server-side roster, connection leases and share state. */
export type RemoteControlEnvironment={sessionId:string;sessionActive:boolean;teacherConnected:boolean;studentConnected:boolean;studentRole:'student'|'teacher'|'assistant'|'observer'|null;share:ClassroomScreenShareLease|null};
export type RemoteControlGrant={
 id:string;sessionId:string;teacherId:string;teacherClientId:string;studentId:string;studentClientId:string;shareClaimId:string;
 state:'requested'|'granted'|'rejected'|'revoked';requestedAt:number;expiresAt:number;
};
export class RemoteControlError extends Error {}
const fail=(message:string):never=>{throw new RemoteControlError(message);};
const validId=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
const isCurrentShare=(grant:RemoteControlGrant,share:ClassroomScreenShareLease|null)=>Boolean(share&&share.userId===grant.studentId&&share.clientId===grant.studentClientId&&share.claimId===grant.shareClaimId);
const isTeacher=(actor:RemoteControlActor)=>actor.role==='teacher'||actor.role==='assistant';
const isLive=(env:RemoteControlEnvironment)=>env.sessionActive===true&&env.teacherConnected===true&&env.studentConnected===true&&env.studentRole==='student';
function validateActor(actor:RemoteControlActor){if(!validId(actor.userId)||!validId(actor.clientId))fail('invalid actor');}
function validateTime(now:number){if(!Number.isSafeInteger(now)||now<0)fail('invalid time');}

/** Call only after the server has independently verified both users and their active connections. */
export function requestRemoteControl(input:{id:string;actor:RemoteControlActor;environment:RemoteControlEnvironment;now:number}):RemoteControlGrant{
 const {id,actor,environment,now}=input;validateActor(actor);validateTime(now);
 const {sessionId,share}=environment;if(!isLive(environment)||!share) return fail('sharing unavailable');
 if(!isTeacher(actor)||!validId(id)||!validId(sessionId)||!validId(share.userId)||!validId(share.clientId)||!validId(share.claimId)||share.userId===actor.userId)fail('invalid request');
 return {id,sessionId,teacherId:actor.userId,teacherClientId:actor.clientId,studentId:share.userId,studentClientId:share.clientId,shareClaimId:share.claimId,state:'requested',requestedAt:now,expiresAt:now+REMOTE_CONTROL_REQUEST_TTL_MS};
}
/** Only the sharing student's original connection may approve or decline. */
export function respondRemoteControl(grant:RemoteControlGrant,actor:RemoteControlActor,environment:RemoteControlEnvironment,accept:boolean,now:number):RemoteControlGrant{
 validateActor(actor);validateTime(now);
 if(typeof accept!=='boolean'||actor.role!=='student'||actor.userId!==grant.studentId||actor.clientId!==grant.studentClientId||grant.state!=='requested'||now<grant.requestedAt||now>=grant.expiresAt||!isLive(environment)||environment.sessionId!==grant.sessionId||!isCurrentShare(grant,environment.share))fail('request unavailable');
 return {...grant,state:accept?'granted':'rejected',expiresAt:accept?now+REMOTE_CONTROL_GRANT_TTL_MS:now};
}
/** Either participant on the original connection can stop an outstanding grant. */
export function revokeRemoteControl(grant:RemoteControlGrant,actor:RemoteControlActor,now:number):RemoteControlGrant{
 validateActor(actor);validateTime(now);
 const student=actor.role==='student'&&actor.userId===grant.studentId&&actor.clientId===grant.studentClientId;
 const teacher=isTeacher(actor)&&actor.userId===grant.teacherId&&actor.clientId===grant.teacherClientId;
 if(!student&&!teacher)fail('not a participant');
 if(grant.state==='rejected'||grant.state==='revoked')return grant;
 return {...grant,state:'revoked',expiresAt:now};
}
/** Fail closed on expiry, role changes, connection replacement, or a new share. */
export function maySendRemoteInput(grant:RemoteControlGrant,actor:RemoteControlActor,environment:RemoteControlEnvironment,now:number):boolean{
 return Number.isSafeInteger(now)&&now>=grant.requestedAt&&now<grant.expiresAt&&grant.state==='granted'&&isLive(environment)&&environment.sessionId===grant.sessionId&&isTeacher(actor)&&actor.userId===grant.teacherId&&actor.clientId===grant.teacherClientId&&isCurrentShare(grant,environment.share);
}

/** A receiver can renew only while the original student is still sharing. */
export function mayReceiveRemoteInput(grant:RemoteControlGrant,actor:RemoteControlActor,environment:RemoteControlEnvironment,now:number):boolean{
 return Number.isSafeInteger(now)&&now>=grant.requestedAt&&now<grant.expiresAt&&grant.state==='granted'&&isLive(environment)&&environment.sessionId===grant.sessionId&&actor.role==='student'&&actor.userId===grant.studentId&&actor.clientId===grant.studentClientId&&isCurrentShare(grant,environment.share);
}
