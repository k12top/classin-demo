import type { ClassroomCompositionSnapshot, ClassroomScreenShareLease } from './types';

export type ScreenShareLeases = Record<string, ClassroomScreenShareLease>;
// main is the displayed publisher; main:<rtcUid> retains prepared publishers.
// Other keys continue to represent independent breakout rooms.
export function mainScreenShareCandidates(shares: ScreenShareLeases = {}) {
  return [...new Map(Object.entries(shares)
    .filter(([scope]) => scope === 'main' || scope.startsWith('main:'))
    .map(([, lease]) => [lease.claimId, lease])).values()];
}

export function prepareMainScreenShare(shares: ScreenShareLeases = {}, lease: ClassroomScreenShareLease, display: boolean) {
  const next = { ...shares };
  if (next.main) next[`main:${next.main.rtcUid}`] = next.main;
  // A new capture on the same connection invalidates its previous claim.
  if (next.main?.clientId === lease.clientId && next.main.userId === lease.userId) delete next.main;
  next[`main:${lease.rtcUid}`] = lease;
  if (display) next.main = lease;
  return next;
}

export function selectMainScreenShare(shares: ScreenShareLeases = {}, claimId: string | null) {
  const next = { ...shares };
  if (next.main) next[`main:${next.main.rtcUid}`] = next.main;
  if (claimId === null) { delete next.main; return next; }
  const lease = mainScreenShareCandidates(next).find(candidate => candidate.claimId === claimId);
  if (!lease) throw new Error('Screen share is no longer ready');
  next.main = lease;
  return next;
}

export function releaseMainScreenShare(shares: ScreenShareLeases = {}, userId: string, clientId: string, claimId: string) {
  return Object.fromEntries(Object.entries(shares).filter(([scope, lease]) =>
    !(scope === 'main' || scope.startsWith('main:')) || lease.userId !== userId || lease.clientId !== clientId || lease.claimId !== claimId));
}

/** Persist teacher intent with the exact invitation, rather than a browser tab. */
export function withScreenShareInvitation(composition: ClassroomCompositionSnapshot, userId: string, requestedAt: Date, autoDisplay = true): ClassroomCompositionSnapshot {
  return { ...composition, screenShareAutoDisplay: autoDisplay ? { userId, requestedAt: requestedAt.toISOString() } : undefined };
}

export function shouldAutoDisplayScreenShare(composition: ClassroomCompositionSnapshot, userId: string, requestedAt: Date | null | undefined) {
  const pending = composition.screenShareAutoDisplay;
  return Boolean(pending && pending.userId === userId && requestedAt && pending.requestedAt === requestedAt.toISOString());
}
