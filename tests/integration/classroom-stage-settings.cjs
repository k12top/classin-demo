/* eslint-disable @typescript-eslint/no-require-imports -- Actual stage actions and settings on disposable PostgreSQL. */
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/classroom_recovery_stage', 'Requires disposable local PostgreSQL');
async function main() {
  const stubs = {
    'server-only': '',
    'next/server': 'export const NextResponse=Response;export const after=()=>{};',
    '@/lib/classroom/server/request-access': 'export const resolveClassroomRequestAccess=async()=>({ok:true,session:globalThis.stageActor,access:globalThis.stageActor});',
    '@/lib/classroom/server/integration-events': 'export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};',
    '@/lib/classroom/server/transcription-orchestrator': 'export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};',
    '@/lib/classroom/server/redis-sync': 'export const synchronizeClassroomRedis=async()=>{};export const flushClassroomRedisPresence=async()=>{};',
    '@/lib/classroom/server/redis-presence': 'export const readRedisClassroomPresence=async()=>null;export const redisClassroomHeartbeat=async()=>null;export const overlayRedisClassroomPresence=s=>s;',
  };
  const outfile = path.join(root, 'node_modules/.cache/classroom-stage-settings.cjs');
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export{applyClassroomAction,touchClassroomMember,ensureClassroomRuntime,getClassroomRuntimeSnapshot}from'@/lib/classroom/server/runtime';export{POST}from'@/app/api/sessions/[sessionId]/classroom/actions/route';`, resolveDir: root }, outfile, bundle: true, format: 'cjs', platform: 'node', packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  } }] });
  const api = require(outfile), db = api.prisma;
  const course = await db.course.create({ data: { name: 'Stage capacity verification', teacherId: 'teacher', teacherName: 'Teacher', ownerId: 'teacher', ownerName: 'Teacher', autoStudentOnStage: true } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: 'Stage', createdBy: 'teacher', startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const actor = (userId, role = 'student') => ({ userId, name: userId, displayName: userId, role, courseId: course.id, sessionId: lesson.id });
  const post = async (userId, role, value) => {
    globalThis.stageActor = actor(userId, role);
    const response = await api.POST(new Request('http://localhost/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: value, clientId: 'fixture' }) }), { params: Promise.resolve({ sessionId: lesson.id }) });
    return { status: response.status, ...await response.json() };
  };
  const member = userId => db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId } } });
  const studentCount = () => db.classroomMemberState.count({ where: { sessionId: lesson.id, role: 'student', onStage: true } });
  try {
    const runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: 'live', stageStudentLimit: 6 } });
    await api.touchClassroomMember(course.id, actor('teacher', 'teacher'), 'teacher', undefined, lesson.id);
    await api.touchClassroomMember(course.id, actor('assistant', 'assistant'), 'assistant', undefined, lesson.id);
    await Promise.all(Array.from({ length: 10 }, (_, index) => api.touchClassroomMember(course.id, actor('student-' + index), 'student', undefined, lesson.id)));
    assert.equal(await studentCount(), 6);
    const offstage = await db.classroomMemberState.findMany({ where: { sessionId: lesson.id, role: 'student', onStage: false } });
    let invited = await post('teacher', 'teacher', { type: 'inviteStage', targetUserId: offstage[0].userId }); assert.equal(invited.status, 200);
    assert.equal((await post(offstage[0].userId, 'student', { type: 'acceptStage' })).status, 200);
    assert.equal(await studentCount(), 7); assert.equal((await member(offstage[0].userId)).microphoneAllowed, true);
    assert.equal((await post(offstage[0].userId, 'student', { type: 'acceptStage' })).status, 200, 'lost submit responses may safely be retried');
    assert.equal((await post(offstage[1].userId, 'student', { type: 'acceptStage' })).status, 409, 'students cannot forge an invitation');
    console.log('PASS an explicit six-seat setting remains bounded under concurrent joins; explicit teacher invitation admits the seventh student and retains consent');
    const settings = { type: 'setStageSettings', studentLimit: 9, inviteBypassLimit: false };
    assert.equal((await post('assistant', 'assistant', settings)).status, 403);
    assert.equal((await post('student-0', 'student', settings)).status, 403);
    assert.equal((await post('teacher', 'teacher', { type: 'setAssistantPermission', targetUserId: 'assistant', allowed: true })).status, 200);
    const updated = await post('assistant', 'assistant', settings); assert.equal(updated.status, 200); assert.equal(updated.runtime.stageStudentLimit, 9); assert.equal(updated.runtime.stageInviteBypassLimit, false);
    await Promise.all(Array.from({ length: 8 }, (_, index) => api.touchClassroomMember(course.id, actor('new-' + index), 'student', undefined, lesson.id)));
    assert.equal(await studentCount(), 9);
    console.log('PASS only lead or authorized assistant changes durable per-lesson settings, and concurrent automatic entries obey the updated limit');
    const waiting = offstage[1].userId;
    assert.equal((await post('teacher', 'teacher', { type: 'inviteStage', targetUserId: waiting })).status, 409);
    assert.equal((await member(waiting)).stageState, 'offstage');
    assert.equal((await post('teacher', 'teacher', { ...settings, studentLimit: 3, inviteBypassLimit: true })).status, 200);
    assert.equal(await studentCount(), 9, 'lowering the setting does not evict existing students');
    assert.equal((await post('assistant', 'assistant', { type: 'inviteStage', targetUserId: waiting })).status, 200);
    assert.equal((await post(waiting, 'student', { type: 'acceptStage' })).status, 200); assert.equal(await studentCount(), 10);
    const refreshed = await api.getClassroomRuntimeSnapshot(course.id, lesson.id); assert.equal(refreshed.stageStudentLimit, 3); assert.equal(refreshed.stageInviteBypassLimit, true);
    console.log('PASS strict mode rejects full invitations before showing a consent prompt; overflow works for authorized assistants, lowering a limit preserves seats and refresh retains settings');
    const shareTarget = offstage[2].userId;
    assert.equal((await post('teacher', 'teacher', { type: 'requestScreenShare', targetUserId: shareTarget })).status, 200);
    assert.equal((await post(shareTarget, 'student', { type: 'acceptScreenShare' })).status, 200);
    assert.equal((await member(shareTarget)).onStage, true);
    const stageIds = (await db.classroomMemberState.findMany({ where: { sessionId: lesson.id, role: 'student', onStage: true } })).map(item => item.userId);
    assert.equal((await post('teacher', 'teacher', { type: 'giveReward', targetUserIds: stageIds, points: 1 })).status, 200);
    assert.equal(await db.classroomRewardEvent.count({ where: { sessionId: lesson.id } }), stageIds.length);
    console.log('PASS teacher-requested screen sharing uses the same overflow setting, and group rewards include every admitted student');
    for (const studentLimit of [0, -1, 101, 2.5, '9', undefined]) assert.equal((await post('teacher', 'teacher', { ...settings, studentLimit })).status, 400);
    assert.equal((await post('teacher', 'teacher', { ...settings, inviteBypassLimit: 'yes' })).status, 400);
    assert.equal((await post('teacher', 'teacher', { type: 'inviteStage', targetUserId: 'assistant' })).status, 409);
    await post('teacher', 'teacher', { type: 'setAssistantPermission', targetUserId: 'assistant', allowed: false });
    assert.equal((await post('assistant', 'assistant', settings)).status, 403);
    assert.equal((await post('assistant', 'assistant', { type: 'inviteStage', targetUserId: offstage[3].userId })).status, 403);
    const other = await db.courseSession.create({ data: { courseId: course.id, position: 2, roomUuid: crypto.randomUUID(), roomType: 4, title: 'Other', createdBy: 'teacher', startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
    const otherRuntime = await api.ensureClassroomRuntime(course.id, other.id); assert.equal(otherRuntime.stageStudentLimit, null); assert.equal(otherRuntime.stageInviteBypassLimit, true);
    const join = (sessionId, userId) => api.touchClassroomMember(course.id, { ...actor(userId), sessionId }, 'student', undefined, sessionId);
    const count = sessionId => db.classroomMemberState.count({ where: { sessionId, role: 'student', onStage: true } });
    await Promise.all(Array.from({ length: 20 }, (_, i) => join(other.id, 'auto-' + i)));
    assert.equal(await count(other.id), 20, 'small classes follow all entering students');
    await Promise.all(Array.from({ length: 5 }, (_, i) => join(other.id, 'late-' + i)));
    assert.equal(await count(other.id), 25, 'late arrivals expand the available seats');
    const configure = value => api.applyClassroomAction({ courseId: course.id, sessionId: other.id, session: actor('teacher','teacher'), role: 'teacher', action: { type:'setStageSettings', studentLimit:value, inviteBypassLimit:false } });
    await configure(6); assert.equal(await count(other.id),25);
    assert.equal((await join(other.id,'fixed-overflow')).onStage,false);
    await configure(null); assert.equal((await join(other.id,'after-reset')).onStage,true);
    assert.equal((await api.getClassroomRuntimeSnapshot(course.id,other.id)).stageStudentLimit,null);
    await api.applyClassroomAction({ courseId:course.id,sessionId:other.id,session:actor('teacher','teacher'),role:'teacher',action:{type:'removeStage',targetUserId:'auto-0'} });
    assert.equal((await join(other.id,'auto-0')).onStage,false,'automatic capacity does not undo an explicit teacher removal');
    console.log('PASS small classes automatically seat 20 concurrent entrants and five late arrivals; fixed limits override this and resetting restores automatic growth');
    let position=3;
    for (const roomType of [2,10]) {
      const item=await db.courseSession.create({data:{courseId:course.id,position:position++,roomUuid:crypto.randomUUID(),roomType,title:'Default thirty',createdBy:'teacher',startTime:new Date(),endTime:new Date(Date.now()+3600000)}});
      await api.ensureClassroomRuntime(course.id,item.id);
      await Promise.all(Array.from({length:35},(_,i)=>join(item.id,'limited-'+i)));
      assert.equal(await count(item.id),30,'large and public live modes default to thirty seats');
      const update=studentLimit=>api.applyClassroomAction({courseId:course.id,sessionId:item.id,session:actor('teacher','teacher'),role:'teacher',action:{type:'setStageSettings',studentLimit,inviteBypassLimit:false}});
      await update(32);assert.equal((await join(item.id,'increased-1')).onStage,true);assert.equal((await join(item.id,'increased-2')).onStage,true);assert.equal((await join(item.id,'increased-3')).onStage,false);
      await update(null);assert.equal((await join(item.id,'default-again')).onStage,false,'reset restores the default thirty without evicting students');
    }
    console.log('PASS large and public live modes cap 35 concurrent entrants at thirty, support an increased fixed limit, and reset to thirty');
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: 'ended' } });
    assert.equal((await post('teacher', 'teacher', settings)).status, 409);
    console.log('PASS malformed settings, staff invitations, revoked assistants, cross-lesson leakage and ended-class mutations are rejected');
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
