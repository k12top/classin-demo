import assert from 'node:assert/strict';
import test from 'node:test';
import { mainScreenShareCandidates, prepareMainScreenShare, selectMainScreenShare, releaseMainScreenShare } from '../src/lib/classroom/screen-share-selection';
import { normalizeClassroomComposition } from '../src/lib/classroom/composition';
import { screenVideoPlan } from '../src/lib/classroom/screen-video-plan';

const a = { userId: 'alice', clientId: 'client-alice', claimId: 'claim-alice', rtcUid: 1500000001 };
const b = { userId: 'bob', clientId: 'client-bob', claimId: 'claim-bob', rtcUid: 1500000002 };
test('multiple ready students do not steal presentation; teacher selection survives normalized snapshots', () => {
  const ready = prepareMainScreenShare(prepareMainScreenShare({}, a, false), b, false);
  assert.equal(ready.main, undefined);
  assert.equal(mainScreenShareCandidates(ready).length, 2);
  const first = selectMainScreenShare(ready, a.claimId);
  const second = selectMainScreenShare(first, b.claimId);
  assert.equal(second.main, b);
  const normalized = normalizeClassroomComposition({ screenShares: second }).screenShares!;
  assert.equal(normalized.main.claimId, b.claimId);
  assert.equal(mainScreenShareCandidates(normalized).length, 2);
  assert.equal(selectMainScreenShare(second, null).main, undefined);
  assert.equal(mainScreenShareCandidates(selectMainScreenShare(second, null)).length, 2);
});
test('late stops and nonowner releases cannot remove a replacement or change the selected student', () => {
  const replacement = { ...a, claimId: 'claim-new-alice' };
  let ready = prepareMainScreenShare(prepareMainScreenShare({}, a, true), b, false);
  ready = selectMainScreenShare(ready, b.claimId);
  ready = prepareMainScreenShare(ready, replacement, false);
  assert.equal(releaseMainScreenShare(ready, a.userId, a.clientId, a.claimId).main.claimId, b.claimId);
  assert.equal(mainScreenShareCandidates(releaseMainScreenShare(ready, a.userId, a.clientId, a.claimId)).length, 2);
  assert.equal(releaseMainScreenShare(ready, b.userId, 'wrong-client', b.claimId).main.claimId, b.claimId);
  const stopped = releaseMainScreenShare(ready, b.userId, b.clientId, b.claimId);
  assert.equal(stopped.main, undefined);
  assert.throws(() => selectMainScreenShare(stopped, b.claimId));
});
test('legacy presenter and breakout leases are preserved while adding prepared students', () => {
  const ready = prepareMainScreenShare({ main: a, breakout: a }, b, false);
  assert.equal(ready.main, a); assert.equal(ready.breakout, a);
  assert.equal(mainScreenShareCandidates(ready).length, 2);
});
test('900p sharing leaves room for twelve thumbnail cameras within Full HD', () => {
  const cameras = Array.from({ length: 12 }, (_, i) => ({ id: `camera-${i}` }));
  const plan = screenVideoPlan([{ id: 'screen' }, ...cameras], id => id === 'screen', new Map([['screen', 1600 * 900]]))!;
  assert.equal(plan.size, 13);
  assert.equal(plan.get('screen'), 0);
  assert.ok(1600 * 900 + cameras.length * 160 * 120 < 1920 * 1080);
});
