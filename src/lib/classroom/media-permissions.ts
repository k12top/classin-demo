import type { ClassroomMediaProvider } from "./types";

const muting = new WeakMap<ClassroomMediaProvider, Promise<void>>();

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
