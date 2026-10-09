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
    '@/lib/course-attendance': 'export const closeOpenAttendanceSessionsForLesson=async()=>{};',
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
    await creds(assistant, 'assistant', false);
    for (const [session, role] of [[student, 'student'], [assistant, 'assistant']]) await assert.rejects(action(session, role, { type: 'startScreenShare', claimId: crypto.randomUUID() }), error => error.status === 403);
    console.log('PASS automatic stage entry and assistant role do not grant sharing in any credential endpoint or start action');
    await grant(student); await creds(student, 'student', true);
    let runtime = await action(student, 'student', { type: 'startScreenShare', claimId: 'student-claim' });
    const original = runtime.members.find(m => m.userId === student.userId);
    await grant(second);
    await assert.rejects(action(second, 'student', { type: 'startScreenShare', claimId: 'second-claim' }), error => error.status === 409);
    runtime = await action(teacher, 'teacher', { type: 'startScreenShare', claimId: 'teacher-claim' });
    assert.equal(runtime.composition.screenShares.main.userId, teacher.userId);
    const replaced = runtime.members.find(m => m.userId === student.userId);
    for (const key of ['onStage', 'stageState', 'microphoneAllowed', 'cameraAllowed', 'chatMuted', 'online']) if (key in original) assert.equal(replaced[key], original[key], key);
    assert.equal(replaced.screenShareState, 'idle');
    await creds(student, 'student', false);
    console.log('PASS host takeover replaces the presenter and revokes only the student screen grant');
    runtime = await action(student, 'student', { type: 'releaseScreenShare', claimId: 'student-claim' });
    assert.equal(runtime.composition.screenShares.main.claimId, 'teacher-claim');
    await assert.rejects(action(second, 'student', { type: 'startScreenShare', claimId: 'teacher-claim' }), error => error.status === 409);
    await action(teacher, 'teacher', { type: 'setAssistantPermission', targetUserId: assistant.userId, allowed: true });
    await assert.rejects(action(assistant, 'assistant', { type: 'stopScreenShare', targetUserId: teacher.userId }), error => error.status === 403);
    runtime = await action(teacher, 'teacher', { type: 'startScreenShare', claimId: 'teacher-second', }, 'other-client-123');
    runtime = await action(teacher, 'teacher', { type: 'releaseScreenShare', claimId: 'teacher-claim' });
    assert.equal(runtime.composition.screenShares.main.claimId, 'teacher-second');
    console.log('PASS stale stops, copied claim ids and other tabs cannot remove or steal the active host share');
    await api.leaveClassroomConnection(lesson.id, teacher.userId, 'other-client-123');
    runtime = await api.getClassroomRuntimeSnapshot(course.id, lesson.id);
    assert.equal(runtime.composition.screenShares.main, undefined);
    await creds(assistant, 'assistant', true);
    await action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'assistant-claim' });
    runtime = await action(teacher, 'teacher', { type: 'setAssistantPermission', targetUserId: assistant.userId, allowed: false });
    assert.equal(runtime.composition.screenShares.main, undefined);
    await creds(assistant, 'assistant', false);
    console.log('PASS tab departure frees the presenter slot and revoked assistant permissions strip screen credentials');
    await grant(student);
    const concurrent = await Promise.allSettled([action(student, 'student', { type: 'startScreenShare', claimId: 'race-student' }), action(second, 'student', { type: 'startScreenShare', claimId: 'race-second' })]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.status, 409);
    console.log('PASS simultaneous authorized starts commit exactly one publisher');
    await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 2 } });
    const space = await db.classroomSpace.create({ data: { courseId: course.id, sessionId: lesson.id, kind: 'breakout', name: 'Room', position: 1, status: 'open', channelName: 'test-breakout' } });
    await db.classroomSpaceMember.create({ data: { courseId: course.id, sessionId: lesson.id, spaceId: space.id, userId: assistant.userId, displayName: assistant.displayName, role: 'assistant' } });
    const roomAccess = () => api.getClassroomSpaceCredentialAccess({ courseId: course.id, sessionId: lesson.id, spaceId: space.id, viewerId: assistant.userId, role: 'assistant' });
    assert.equal((await roomAccess()).allowScreenShare, false);
    await assert.rejects(action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'room-claim', spaceId: space.id }), error => error.status === 403);
    await assert.rejects(api.updateClassroomSpace({ courseId: course.id, sessionId: lesson.id, spaceId: space.id, actorId: assistant.userId, actorRole: 'assistant', action: 'permissions', targetUserId: assistant.userId, screenShareAllowed: true }), error => error.status === 403);
    await db.classroomSpaceMember.updateMany({ where: { spaceId: space.id, userId: assistant.userId }, data: { screenShareAllowed: true } });
    assert.equal((await roomAccess()).allowScreenShare, true);
    runtime = await action(assistant, 'assistant', { type: 'startScreenShare', claimId: 'room-claim', spaceId: space.id });
    assert.equal(runtime.composition.screenShares[space.id].userId, assistant.userId);
    globalThis.screenActor = assistant;
    globalThis.screenAccess = { courseId: course.id, sessionId: lesson.id, role: 'assistant' };
    const response = await api.roomCredential(new Request('http://localhost/api/space-credential', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId:space.id,clientId})}), {params:Promise.resolve({id:lesson.id})});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).credential.screenShare.rtcUid, runtime.composition.screenShares[space.id].rtcUid, 'room tokens must use the same tab identity as publisher ownership');
    console.log('PASS breakout assistants also require an explicit grant and cannot grant themselves permission');
  } finally {
    await db.classroomConnection.deleteMany({ where: { sessionId: lesson.id } });
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
