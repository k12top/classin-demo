// Agora STT and Cloud Recording identify channel members with numeric UIDs.
// Keep each publisher type in a separate range so screens and bots can be
// recognized without changing the application's UUID-based member identity.
export type ClassroomRtcUidKind = "camera" | "screen" | "stt-subscriber" | "stt-publisher" | "recorder";

const ranges: Record<ClassroomRtcUidKind, readonly [number, number]> = {
  camera: [1, 1_000_000_000],
  screen: [1_000_000_001, 2_000_000_000],
  "stt-subscriber": [2_000_000_001, 2_500_000_000],
  "stt-publisher": [2_500_000_001, 3_000_000_000],
  recorder: [3_000_000_001, 4_000_000_000],
};

export function classroomRtcUid(identity: string, kind: ClassroomRtcUidKind): number {
  let hash = 0x811c9dc5;
  for (const char of `${kind}:${identity}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  const [first, last] = ranges[kind];
  return first + ((hash >>> 0) % (last - first + 1));
}

export function isClassroomScreenRtcUid(id: string): boolean {
  const uid = Number(id);
  return Number.isInteger(uid) && uid >= ranges.screen[0] && uid <= ranges.screen[1];
}
