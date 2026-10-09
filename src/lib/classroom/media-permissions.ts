import type { ClassroomMediaProvider } from "./types";

const muting = new WeakMap<ClassroomMediaProvider, Promise<void>>();
const permissionStates = new WeakMap<ClassroomMediaProvider, {
  allowed: boolean; resume: boolean; version: number; pending?: Promise<void>;
}>();

/** Restore only a microphone that was on before moderation muted it. */
export function applyMicrophonePermission(provider: ClassroomMediaProvider, allowed: boolean): Promise<void> {
  let state = permissionStates.get(provider);
  if (!state) { state = { allowed: true, resume: false, version: 0 }; permissionStates.set(provider, state); }
  if (state.allowed === allowed && (allowed ? !state.resume : !provider.getSnapshot().local.microphoneOn)) return state.pending || Promise.resolve();
  if (!allowed && state.allowed) state.resume = provider.getSnapshot().local.microphoneOn;
  state.allowed = allowed;
  provider.setMicrophonePermission?.(allowed);
  ++state.version;
  if (state.pending) return state.pending;
  const current = state;
  const operation = Promise.resolve().then(async () => {
    for (;;) {
      const version = current.version;
      try {
        if (!current.allowed) await stopDisallowedMicrophone(provider);
        else if (current.resume) {
          if (!provider.getSnapshot().local.microphoneOn) await provider.toggleMicrophone();
          current.resume = false;
        }
      } catch (error) {
        if (version === current.version) throw error;
      }
      if (version === current.version) return;
    }
  });
  current.pending = operation;
  void operation.finally(() => { if (current.pending === operation) current.pending = undefined; }).catch(() => undefined);
  return operation;
}

/** Permission enforcement is an absolute mute, even across repeated snapshots. */
export function stopDisallowedMicrophone(provider: ClassroomMediaProvider): Promise<void> {
  const pending = muting.get(provider);
  if (pending) return pending;
  const operation = Promise.resolve().then(async () => {
    if (provider.getSnapshot().local.microphoneOn) await provider.toggleMicrophone();
  });
  muting.set(provider, operation);
  void operation.finally(() => {
    if (muting.get(provider) === operation) muting.delete(provider);
  }).catch(() => undefined);
  return operation;
}
