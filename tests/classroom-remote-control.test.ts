import assert from 'node:assert/strict';
import test from 'node:test';
import {mayReceiveRemoteInput,maySendRemoteInput,REMOTE_CONTROL_GRANT_TTL_MS,REMOTE_CONTROL_REQUEST_TTL_MS,requestRemoteControl,respondRemoteControl,revokeRemoteControl,type RemoteControlActor} from '../src/lib/classroom/remote-control';
const teacher:RemoteControlActor={userId:'teacher',clientId:'teacher-device',role:'teacher'},student:RemoteControlActor={userId:'student',clientId:'student-device',role:'student'};
const share={userId:'student',clientId:'student-device',rtcUid:7,claimId:'screen-claim-1'},now=1_000;
const environment={sessionId:'lesson-1',sessionActive:true,teacherConnected:true,studentConnected:true,studentRole:'student' as const,share};
const request=()=>requestRemoteControl({id:'request-1',actor:teacher,environment,now});
test('remote control needs consent on the exact sharing connection',()=>{
 const pending=request();assert.equal(maySendRemoteInput(pending,teacher,environment,now+1),false);
 assert.throws(()=>respondRemoteControl(pending,{...student,clientId:'other'},environment,true,now+1));
 assert.throws(()=>respondRemoteControl(pending,student,{...environment,share:{...share,claimId:'new-claim'}},true,now+1));
 assert.throws(()=>respondRemoteControl(pending,student,environment,true,now+REMOTE_CONTROL_REQUEST_TTL_MS));
 const granted=respondRemoteControl(pending,student,environment,true,now+1);
 assert.equal(maySendRemoteInput(granted,teacher,environment,now+2),true);
 for(const [actor,current] of [[teacher,{...environment,sessionId:'another'}],[{...teacher,role:'student'},environment],[{...teacher,clientId:'other'},environment],[teacher,{...environment,share:{...share,claimId:'new-claim'}}],[teacher,{...environment,share:null}],[teacher,{...environment,sessionActive:false}],[teacher,{...environment,teacherConnected:false}],[teacher,{...environment,studentConnected:false}],[teacher,{...environment,studentRole:'observer'}]] as const)assert.equal(maySendRemoteInput(granted,actor,current,now+2),false);
 assert.equal(maySendRemoteInput(granted,teacher,environment,now+1+REMOTE_CONTROL_GRANT_TTL_MS),false);
});
test('student or requesting teacher can revoke; other participants cannot',()=>{
 const granted=respondRemoteControl(request(),student,environment,true,now+1);
 assert.throws(()=>revokeRemoteControl(granted,{...teacher,userId:'other'},now+2));
 for(const actor of [teacher,student])assert.equal(maySendRemoteInput(revokeRemoteControl(granted,actor,now+2),teacher,environment,now+3),false);
 assert.equal(respondRemoteControl(request(),student,environment,false,now+1).state,'rejected');
 assert.throws(()=>requestRemoteControl({id:'x',actor:student,environment,now}));
});

test('an active lesson remains controllable beyond five minutes but ends on revocation or disconnect',()=>{
 const granted=respondRemoteControl(request(),student,environment,true,now+1);
 const later=now+6*60_000;
 assert.equal(maySendRemoteInput(granted,teacher,environment,later),true);
 assert.equal(mayReceiveRemoteInput(granted,student,environment,later),true);
 assert.equal(mayReceiveRemoteInput(granted,student,{...environment,studentConnected:false},later),false);
 const stopped=revokeRemoteControl(granted,student,later);
 assert.equal(maySendRemoteInput(stopped,teacher,environment,later+1),false);
 assert.equal(mayReceiveRemoteInput(stopped,student,environment,later+1),false);
});

test('receiver lease belongs only to the original student and live share',()=>{
 const pending=request(),granted=respondRemoteControl(pending,student,environment,true,now+1);
 assert.equal(mayReceiveRemoteInput(pending,student,environment,now+2),false);
 assert.equal(mayReceiveRemoteInput(granted,student,environment,now+2),true);
 for(const actor of [teacher,{...student,clientId:'other'},{...student,userId:'other'},{...student,role:'observer' as const}])assert.equal(mayReceiveRemoteInput(granted,actor,environment,now+2),false);
 for(const current of [{...environment,studentConnected:false},{...environment,teacherConnected:false},{...environment,studentRole:'teacher' as const},{...environment,share:null},{...environment,share:{...share,claimId:'new'}},{...environment,sessionId:'other'}])assert.equal(mayReceiveRemoteInput(granted,student,current,now+2),false);
 assert.equal(mayReceiveRemoteInput(granted,student,environment,granted.expiresAt),false);
 assert.equal(mayReceiveRemoteInput(revokeRemoteControl(granted,student,now+3),student,environment,now+4),false);
});
