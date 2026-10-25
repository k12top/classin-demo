import assert from "node:assert/strict";
import test from "node:test";
import { participantOwnerId } from "../src/lib/classroom/participant-identity";
import { classroomParticipantOwnerId } from "../src/lib/classroom/local-participant";
import { classroomRtcUid } from "../src/lib/classroom/rtc-uid";
import { selectClassroomCameraParticipants } from "../src/lib/classroom/camera-selection";
import { recorderCameraParticipants } from "../src/lib/classroom/recorder-surface";
import type { ClassroomMemberSnapshot, ClassroomParticipant } from "../src/lib/classroom/types";

const camera = (id: string, values: Partial<ClassroomParticipant> = {}): ClassroomParticipant => ({ id, kind: "camera", isLocal: false, hasVideo: true, hasAudio: true, displayName: id, ...values });

test("explicit connection ownership wins over an earlier member's legacy hash", () => {
  const uid = String(classroomRtcUid("teacher", "camera"));
  const members = [{userId:"teacher"}, {userId:"student",rtcUids:[Number(uid)]}];
  assert.equal(participantOwnerId(uid,members),"student");
  assert.equal(classroomParticipantOwnerId({id:uid,isLocal:false},members,"teacher"),"student");
  assert.equal(participantOwnerId(uid,[{userId:"teacher",rtcUids:[],screenUids:[]}]),uid);
  assert.equal(participantOwnerId(uid,[{userId:"teacher",rtcUids:[Number(uid)]},{userId:"student",rtcUids:[Number(uid)]}]),"");
});

test("one account produces one main camera independent of SDK arrival order", () => {
  const members=[{userId:"teacher",role:"teacher",onStage:true,rtcUids:[101,102]}] as ClassroomMemberSnapshot[];
  const peers=[camera("101"),camera("102"),camera("aux",{kind:"auxiliary-camera"})];
  assert.deepEqual(selectClassroomCameraParticipants(peers,members).map(p=>p.id),["101","aux"]);
  assert.deepEqual(selectClassroomCameraParticipants([...peers].reverse(),members).map(p=>p.id),["aux","101"]);
  assert.deepEqual(recorderCameraParticipants(peers,members,[],false).map(p=>p.id),["101"]);
  assert.equal(selectClassroomCameraParticipants([camera("101",{hasVideo:false,isLocal:true}),camera("102")],members,"teacher")[0].id,"102");
  assert.equal(selectClassroomCameraParticipants([camera("101"),camera("102",{isLocal:true})],members,"teacher")[0].id,"102");
});

test("a closed connection cannot appear beside the same account's new publisher", () => {
  const members=[{userId:"student",rtcUids:[103]}];
  assert.deepEqual(selectClassroomCameraParticipants([camera("old"),camera("103")],members).map(p=>p.id),["103"]);
  assert.deepEqual(selectClassroomCameraParticipants([camera("103")],[{userId:"student",rtcUids:[]}]),[]);
});
