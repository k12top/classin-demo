/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL integration harness. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/classroom_recovery_'), 'requires a disposable loopback database');
async function main() {
  const output = path.join(root, 'node_modules/.cache/classroom-screen-permissions.cjs');
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    'server-only': '',
    'next/server': 'export const after=()=>{};export const NextResponse=Response;',
    '@/lib/session': 'export const getSessionFromRequest=async()=>globalThis.screenActor;',
    '@/lib/course-session-access': 'export const resolveCourseSessionAccess=async()=>({ok:true,...globalThis.screenAccess});',
    '@/lib/classroom/server/request-access': 'export const resolveClassroomRequestAccess=async()=>({ok:true,session:globalThis.screenActor,access:globalThis.screenAccess});',
    '@/lib/classroom/server/integration-events': 'export const enqueueClassroomEvent=async()=>{};',
    '@/lib/course-attendance': 'export const closeOpenAttendanceSessionsForLesson=async()=>{};export const closeAllOpenAttendanceForLesson=async()=>{};',
    '@/lib/classroom/server/recorder-token': 'export const verifyRecorderToken=async()=>false;',
    '@/lib/classroom/server/recording-orchestrator': 'export const recoverInterruptedRecordingForSession=async()=>{};',
    '@/lib/classroom/server/transcription-orchestrator': 'export const classroomInterpretationAvailability=async()=>({shengwang:false,wordly:false});',
    '@/lib/classroom/signaling/agora-server': "import {classroomSignalingUserId} from '@/lib/classroom/signaling/identity';export const issueAgoraSignalingCredential=(channel,userId)=>({userId:classroomSignalingUserId(userId),channelName:channel,token:'test'});",
    '@/lib/classroom/whiteboard/provider-factory': 'export const getWhiteboardProvider=()=>({issueJoinCredential:async()=>({enabled:false})});',
    '@/lib/classroom/server/provider-factory': `import {classroomRtcUid} from '@/lib/classroom/rtc-uid';export const getRecordingProvider=()=>({isConfigured:()=>false});export const getClassroomServerProvider=()=>({issueCredential:input=>{const identity=input.clientId?input.userId+':'+input.clientId:input.userId;return {provider:'agora',appId:'test',...input,publishAllowed:input.publisher,rtcUid:classroomRtcUid(identity,'camera'),screenShare:input.publisher&&input.allowScreenShare?{rtcUid:classroomRtcUid(identity,'screen'),token:'test'}:undefined}}});`,
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export * from '@/lib/classroom/server/runtime';export * from '@/lib/classroom/server/connections';export * from '@/lib/classroom/server/spaces';export {POST as join} from '@/app/api/classroom/session/route';export {POST as publish} from '@/app/api/classroom/session/publish-credential/route';export {POST as renew} from '@/app/api/classroom/session/renew-credential/route';export {POST as roomCredential} from '@/app/api/courses/[id]/classroom/spaces/credential/route';`, resolveDir: root }, outfile: output, bundle: true, format: 'cjs', platform: 'node', packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'isolated-external-services', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'mock' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: stubs[args.path], loader: 'js', resolveDir: root }));
  } }] });
  const api = require(output), db = api.prisma;
  const actor = (userId) => ({ userId, name: userId, displayName: userId, avatar: '' });
  const teacher = actor('teacher'), student = actor('student'), second = actor('second'), assistant = actor('assistant');
  const clientId = 'client-123456';
  const course = await db.course.create({ data: { name: 'Screen permissions', ownerId: teacher.userId, ownerName: 'Teacher', teacherId: teacher.userId, teacherName: 'Teacher' } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: 'Screen permissions', createdBy: teacher.userId, startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const action = (session, role, value, tab = clientId) => api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session, role, clientId: tab, action: value });
  const grant = async session => { await action(teacher, 'teacher', { type: 'requestScreenShare', targetUserId: session.userId }); await action(session, 'student', { type: 'acceptScreenShare' }); };
  const creds = async (session, role, expected) => {
    globalThis.screenActor = session;
    globalThis.screenAccess = { courseId: course.id, sessionId: lesson.id, roomUuid: lesson.roomUuid, role };
    for (const route of ['join', 'publish', 'renew']) {
      const response = await api[route](new Request('http://localhost/api/classroom/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: lesson.id, clientId }) }));
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      assert.equal(Boolean(payload.credential.screenShare), expected, `${role} ${route} screen token`);
      if (route === 'join') assert.equal(payload.capabilities.canShareScreen, expected);
      if (route !== 'publish') assert.equal(payload.signaling.userId, `${session.userId}:${clientId}`, `${route} retains the same RTM identity`);
      if (route === 'join') assert.ok(payload.runtime.members.find(m => m.userId === session.userId).signalingUserIds.includes(payload.signaling.userId));
    }
  };
  try {
    await api.ensureClassroomRuntime(course.id, lesson.id);
    for (const [session, role] of [[teacher, 'teacher'], [student, 'student'], [second, 'student'], [assistant, 'assistant']]) {
      await api.touchClassroomMember(course.id, session, role, undefined, lesson.id);
      await api.touchClassroomConnection(lesson.id, session.userId, clientId, true);
    }
    await creds(student, 'student', false);
    await creds(assistant, 'assistant', true);
    await assert.rejects(action(student, 'student', { type: 'startScreenShare', claimId: 'unapproved-claim' }), error => error.status === 403);
    console.log('PASS students require approval while assistants have teaching-role share credentials');
    await grant(student); await creds(student, 'student', true);
    let runtime = await action(student, 'student', { type: 'startScreenShare', claimId: 'student-claim' });
    runtime = await action(student, 'student', { type: 'releaseScreenShare', claimId: 'student-claim' });
    assert.equal(runtime.composition.screenShares.main, undefined);
    assert.equal(runtime.members.find(m => m.userId === student.userId).screenShareState, 'accepted');
    await creds(student, 'student', true);
    await action(student, 'student', { type: 'startScreenShare', claimId: 'student-claim' });
    await grant(second);
    runtime = await action(second, 'student', { type: 'startScreenShare', claimId: 'second-claim' });
    const leases = () => Object.values(runtime.composition.screenShares);
    assert.ok(leases().some(lease => lease.claimId === 'student-claim'));
    assert.ok(leases().some(lease => lease.claimId === 'second-claim'));
    runtime = await action(teacher, 'teacher', { type: 'startScreenShare', claimId: 'teacher-claim' });
    assert.equal(runtime.composition.screenShares.main.userId, teacher.userId);
    assert.ok(leases().some(lease => lease.claimId === 'student-claim'));
    await creds(student, 'student', true);
    await assert.rejects(action(second, 'student', { type: 'startScreenShare', claimId: 'teacher-claim' }), error => error.status === 409);
    runtime = await action(assistant, 'assistant', { type: 'stopScreenShare', targetUserId: student.userId });
    assert.ok(!leases().some(lease => lease.claimId === 'student-claim'));
    assert.ok(leases().some(lease => lease.claimId === 'second-claim'));
    assert.equal(runtime.composition.screenShares.main.claimId, 'teacher-claim');
    await creds(student, 'student', false);
    runtime = await action(student, 'student', { type: 'releaseScreenShare', claimId: 'student-claim' });
    assert.equal(runtime.composition.screenShares.main.claimId, 'teacher-claim');
    console.log('PASS concurrent presenters, teacher display, assistant revocation and stale release isolation');
    await assert.rejects(action(teacher, 'teacher', { type: 'setAssistantPermission', targetUserId: assistant.userId, allowed: false }), error => error.status === 400);
    await creds(assistant, 'assistant', true);
    await api.touchClassroomConnection(lesson.id, teacher.userId, 'other-client-123', true);
    runtime = await action(teacher, 'teacher', { type: 'startScreenShare', claimId: 'teacher-second' }, 'other-client-123');
    runtime = await action(teacher, 'teacher', { type: 'releaseScreenShare', claimId: 'teacher-claim' });
    assert.equal(runtime.composition.screenShares.main.claimId, 'teacher-second');
    await api.leaveClassroomConnection(lesson.id, teacher.userId, 'other-client-123');
    runtime = await api.getClassroomRuntimeSnapshot(course.id, lesson.id);
    assert.ok(!leases().some(lease => lease.claimId === 'teacher-second'));
    await action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'assistant-claim' });
    runtime = await action(assistant, 'assistant', { type: 'releaseScreenShare', claimId: 'assistant-claim' });
    assert.ok(!leases().some(lease => lease.claimId === 'assistant-claim'));
    console.log('PASS stale tab releases and assistant sharing retain connection ownership');
    await grant(student);
    const concurrent = await Promise.allSettled([action(student, 'student', { type: 'startScreenShare', claimId: 'race-student' }), action(second, 'student', { type: 'startScreenShare', claimId: 'race-second' })]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 2);
    runtime = await api.getClassroomRuntimeSnapshot(course.id, lesson.id);
    assert.ok(leases().some(lease => lease.claimId === 'race-student'));
    assert.ok(leases().some(lease => lease.claimId === 'race-second'));
    console.log('PASS simultaneous authorized students retain distinct publishers');
    await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 2 } });
    const space = await db.classroomSpace.create({ data: { courseId: course.id, sessionId: lesson.id, kind: 'breakout', name: 'Room', position: 1, status: 'open', channelName: 'test-breakout' } });
    await db.classroomSpaceMember.create({ data: { courseId: course.id, sessionId: lesson.id, spaceId: space.id, userId: assistant.userId, displayName: assistant.displayName, role: 'assistant' } });
    const roomAccess = () => api.getClassroomSpaceCredentialAccess({ courseId: course.id, sessionId: lesson.id, spaceId: space.id, viewerId: assistant.userId, role: 'assistant' });
    assert.equal((await roomAccess()).allowScreenShare, false);
    const unassigned = await api.getClassroomSpaceCredentialAccess({ courseId: course.id, sessionId: lesson.id, spaceId: space.id, viewerId: 'unassigned-assistant', role: 'assistant' });
    assert.equal(unassigned.publisher, false);assert.equal(unassigned.allowScreenShare, false);
    await assert.rejects(action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'room-claim', spaceId: space.id }), error => error.status === 403);
    globalThis.screenActor = assistant;
    globalThis.screenAccess = { courseId: course.id, sessionId: lesson.id, role: 'assistant' };
    const beforeGrant = await api.roomCredential(new Request('http://localhost/api/space-credential', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId:space.id,clientId})}), {params:Promise.resolve({id:lesson.id})});
    assert.equal(beforeGrant.status, 200);assert.equal((await beforeGrant.json()).credential.screenShare, undefined);
    await api.updateClassroomSpace({ courseId: course.id, sessionId: lesson.id, spaceId: space.id, actorId: assistant.userId, actorRole: 'assistant', action: 'permissions', targetUserId: assistant.userId, screenShareAllowed: true });
    assert.equal((await roomAccess()).allowScreenShare, true);
    runtime = await action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'room-claim', spaceId: space.id });
    assert.equal(runtime.composition.screenShares[space.id].userId, assistant.userId);
    globalThis.screenActor = assistant;
    globalThis.screenAccess = { courseId: course.id, sessionId: lesson.id, role: 'assistant' };
    const response = await api.roomCredential(new Request('http://localhost/api/space-credential', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId:space.id,clientId})}), {params:Promise.resolve({id:lesson.id})});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).credential.screenShare.rtcUid, runtime.composition.screenShares[space.id].rtcUid, 'room tokens must use the same tab identity as publisher ownership');
    console.log('PASS breakout sharing checks room grant and binds token to the active tab');
    const returningLesson = await db.courseSession.create({ data: { courseId: course.id, position: 2, roomUuid: crypto.randomUUID(), roomType: 0, title: 'Re-entry', createdBy: teacher.userId, startTime: new Date(), endTime: new Date(Date.now()+3600000) } });
    const a = actor('returning-a'), b = actor('returning-b');
    const enter = (person, joining = true) => api.touchClassroomMember(course.id, person, 'student', undefined, returningLesson.id, joining);
    const moderate = value => api.applyClassroomAction({ courseId: course.id, sessionId: returningLesson.id, session: teacher, role: 'teacher', clientId, action: value });
    assert.equal((await enter(a)).onStage, true);
    assert.equal((await enter(b)).onStage, false);
    await api.touchClassroomConnection(returningLesson.id, a.userId, clientId, true);
    await moderate({type:'setMediaAllowed',targetUserId:a.userId,microphoneAllowed:false,cameraAllowed:false});
    await api.leaveClassroomConnection(returningLesson.id, a.userId, clientId, true);
    assert.equal((await enter(a, false)).onStage, false, 'background work cannot promote a departed student');
    let returned = await enter(a);
    assert.equal(returned.onStage, true); assert.equal(returned.microphoneAllowed, false);
    await api.touchClassroomConnection(returningLesson.id, a.userId, clientId, true);
    await moderate({type:'removeStage',targetUserId:a.userId});
    await api.leaveClassroomConnection(returningLesson.id, a.userId, clientId, true);
    assert.equal((await enter(a)).onStage, false, 'teacher removal survives a real leave/re-entry');
    assert.equal((await enter(b)).onStage, true, 'capacity waiter is reconsidered on entry');
    await moderate({type:'removeStage',targetUserId:b.userId});
    await moderate({type:'inviteStage',targetUserId:a.userId});
    await api.applyClassroomAction({courseId:course.id,sessionId:returningLesson.id,session:a,role:'student',clientId,action:{type:'declineStage'}});
    await api.touchClassroomConnection(returningLesson.id, a.userId, clientId, true);
    await api.leaveClassroomConnection(returningLesson.id, a.userId, clientId, true);
    assert.equal((await enter(a)).onStage, false, 'declined invitations survive re-entry');
    await db.classroomMemberState.updateMany({where:{sessionId:returningLesson.id,role:'student'},data:{onStage:false,stageState:'left'}});
    const race = await Promise.all([enter(a),enter(b)]);
    assert.equal(race.filter(member=>member.onStage).length,1,'parallel re-entry reserves exactly one seat');
    console.log('PASS voluntary re-entry, moderation, declined invitations, capacity waits and concurrent admission');

  } finally {
    await db.classroomConnection.deleteMany({ where: { sessionId: lesson.id } });
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
