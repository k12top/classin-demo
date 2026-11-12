import assert from 'node:assert/strict';
import test from 'node:test';
import {verifiedRemoteControlHint} from '../src/lib/classroom/remote-control-hint';
import type {ClassroomRemoteControlHint} from '../src/lib/classroom/signaling/types';
const members=[{userId:'teacher',role:'teacher',signalingUserIds:['teacher-channel']},{userId:'student',role:'student',signalingUserIds:['student-channel']},{userId:'other',role:'student',signalingUserIds:['other-channel']}];
const hint:ClassroomRemoteControlHint={courseId:'lesson',topic:'remote-control-hint',revision:0,actorId:'teacher',targetUserId:'student'};
test('only matching classroom participants can request an authoritative refresh',()=>{
 assert.equal(verifiedRemoteControlHint(hint,'teacher-channel','student',members),true);
 assert.equal(verifiedRemoteControlHint(hint,'other-channel','student',members),false);
 assert.equal(verifiedRemoteControlHint(hint,'teacher-channel','other',members),false);
 assert.equal(verifiedRemoteControlHint({...hint,actorId:'other'},'other-channel','student',members),false);
 assert.equal(verifiedRemoteControlHint({...hint,actorId:'student',targetUserId:'teacher'},'student-channel','teacher',members),true);
 assert.equal(verifiedRemoteControlHint(hint,undefined,'student',members),false);
});
