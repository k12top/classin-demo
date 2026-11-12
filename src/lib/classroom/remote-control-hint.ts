import type {ClassroomRemoteControlHint} from './signaling/types';

type Member={userId:string;role:string;signalingUserIds?:string[]};
/** A hint can only request a fresh authorized read. It never grants control. */
export function verifiedRemoteControlHint(hint:ClassroomRemoteControlHint,publisherId:string|undefined,selfId:string,members:readonly Member[]):boolean{
 if(!publisherId||hint.topic!=='remote-control-hint'||hint.revision!==0||typeof hint.actorId!=='string'||typeof hint.targetUserId!=='string'||hint.actorId===hint.targetUserId||hint.targetUserId!==selfId)return false;
 const sender=members.find(member=>member.userId===hint.actorId),recipient=members.find(member=>member.userId===selfId);
 if(!sender||!recipient||!sender.signalingUserIds?.includes(publisherId))return false;
 return ((sender.role==='teacher'||sender.role==='assistant')&&recipient.role==='student')||((recipient.role==='teacher'||recipient.role==='assistant')&&sender.role==='student');
}
