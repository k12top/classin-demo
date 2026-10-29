/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory database boundary for the actual action service. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/load-module';
import { classroomGraceEndAt } from '../src/lib/classroom/policy';
import { emptyClassroomComposition } from '../src/lib/classroom/composition';
import { mainScreenShareCandidates } from '../src/lib/classroom/screen-share-selection';
import type { ClassroomAction } from '../src/lib/classroom/types';

function fixture() {
  const startTime = new Date(Date.now() - 60000), endTime = new Date(Date.now() + 3600000);
  const runtime: any = { id: 'runtime', revision: 1, status: 'live', graceEndsAt: classroomGraceEndAt(endTime), composition: emptyClassroomComposition(), session: { startTime, endTime }, members: [] };
  const members = new Map(['alice', 'bob'].map(userId => [userId, { userId, role: 'student', screenShareState: 'accepted', onStage: true, stageState: 'accepted' }]));
  const db: any = {
    courseSession: { findFirst: async () => ({ id: 'lesson', roomType: 2, status: 'live', startTime, endTime, course: { autoStudentOnStage: false } }) },
    classroomRuntime: { findUnique: async () => runtime, findUniqueOrThrow: async () => runtime, update: async ({data}: any) => { if (data.composition) runtime.composition = data.composition; if (data.revision) runtime.revision += data.revision.increment; if (data.stageMode) runtime.stageMode = data.stageMode; return runtime; } },
    classroomMemberState: {
      findUnique: async ({where}: any) => members.get(where.sessionId_userId.userId),
      upsert: async () => ({}), update: async ({where,data}: any) => Object.assign(members.get(where.sessionId_userId.userId)!, data), updateMany: async () => ({count:0}),
    },
    classroomRewardEvent: { groupBy: async () => [] }, classroomConnection: { findMany: async () => [] }, $queryRaw: async () => [],
  };
  const prisma = { ...db, $transaction: async (fn: any) => fn(db) };
  const api = loadModule<typeof import('../src/lib/classroom/server/runtime')>('src/lib/classroom/server/runtime.ts', {
    'server-only': {}, '@/lib/db': { prisma }, './command-receipt': { readClassroomCommand: async () => null, saveClassroomCommand: async () => {} },
    '@/lib/courseware-conversion': {}, './integration-events': {}, '@/lib/course-session-status': {}, './shared-cache': {}, './caption-demand': {},
    './redis-presence': { readRedisClassroomPresence: async () => null, overlayRedisClassroomPresence: (value: unknown) => value }, './redis-sync': { refreshClassroomRedisControl: async () => {} },
  });
  const apply = (action: ClassroomAction, userId='teacher', role: 'teacher' | 'student'='teacher', revision=runtime.revision) => api.applyClassroomAction({ courseId:'course', sessionId:'lesson', session: {userId,displayName:userId,name:userId,avatar:''}, role, clientId:`client-${userId}`, expectedRevision:revision, action });
  return {runtime,members,apply};
}

test('actual service lets two invited students prepare and only teachers choose the globally displayed share', async () => {
  const f=fixture();
  await f.apply({type:'startScreenShare',claimId:'claim-alice'},'alice','student');
  await f.apply({type:'startScreenShare',claimId:'claim-bob'},'bob','student');
  const shares=f.runtime.composition.screenShares;
  assert.equal(mainScreenShareCandidates(shares).length,2); assert.equal(shares.main,undefined);
  await assert.rejects(f.apply({type:'selectScreenShare',claimId:'claim-alice'},'bob','student'),{status:403});
  await f.apply({type:'selectScreenShare',claimId:'claim-alice'});
  assert.equal(f.runtime.composition.screenShares.main.userId,'alice');
  const revision=f.runtime.revision;
  await f.apply({type:'selectScreenShare',claimId:'claim-bob'});
  await assert.rejects(f.apply({type:'selectScreenShare',claimId:'claim-alice'},'teacher','teacher',revision),/Classroom state changed/);
  assert.equal(f.runtime.composition.screenShares.main.userId,'bob');
  await f.apply({type:'releaseScreenShare',claimId:'claim-alice'},'alice','student');
  assert.equal(f.runtime.composition.screenShares.main.userId,'bob');
  await f.apply({type:'stopScreenShare',targetUserId:'bob'});
  assert.equal(f.runtime.composition.screenShares.main,undefined);
  assert.equal(mainScreenShareCandidates(f.runtime.composition.screenShares).length,0);
});

test('actual service rejects unauthorized capture and released selections; whiteboard preserves ready candidates', async () => {
  const f=fixture(); f.members.get('alice')!.screenShareState='idle';
  await assert.rejects(f.apply({type:'startScreenShare',claimId:'claim-alice'},'alice','student'),{status:403});
  await assert.rejects(f.apply({type:'selectScreenShare',claimId:'claim-gone'}),{status:409});
  await f.apply({type:'startScreenShare',claimId:'claim-bob'},'bob','student');
  await f.apply({type:'selectScreenShare',claimId:'claim-bob'});
  await f.apply({type:'setStage',mode:'whiteboard',locked:false});
  assert.equal(f.runtime.composition.screenShares.main,undefined);
  assert.equal(mainScreenShareCandidates(f.runtime.composition.screenShares).length,1);
});
