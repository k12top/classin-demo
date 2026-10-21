import type { ClassroomCoursewareSnapshot } from "./types";
import { insertCoursewareOnWhiteboard } from "./courseware-insertion";

type DocumentApp = Parameters<typeof insertCoursewareOnWhiteboard>[0] & {
  canOperate?: boolean;
  manager: {
    queryAll(): { id: string; scenePath?: string }[];
    queryOne(id: string): unknown;
    setMinimized(value: boolean): void;
    setBoxStatus(id: string): void;
    focusApp(id: string): void;
  };
};
const states = new WeakMap<object, { apps: Map<string, string>; pending: Map<string, Promise<string>>; request: number }>();

/** Insertion is idempotent, but each explicit presentation restores and focuses the document. */
export function cancelCoursewarePresentation(app: object) {
  const state = states.get(app);
  if (state) ++state.request;
}
export async function presentCoursewareOnWhiteboard(app: DocumentApp, item: ClassroomCoursewareSnapshot, isCurrent: () => boolean = () => true) {
  const writable = () => app.canOperate !== false;
  if (!writable()) throw new Error("WHITEBOARD_NOT_WRITABLE");
  let state = states.get(app);
  if (!state) { state = { apps: new Map(), pending: new Map(), request: 0 }; states.set(app, state); }
  const request = ++state.request;
  const key = `${item.id}:${item.taskUuid}`;
  const scenePath = `/courseware/${encodeURIComponent(item.id)}/${encodeURIComponent(item.taskUuid || "")}`;
  let id = state.apps.get(key);
  if (!id || !app.manager.queryOne(id)) {
    id = app.manager.queryAll().find(candidate => candidate.scenePath === scenePath)?.id;
    if (!id) {
      let pending = state.pending.get(key);
      if (!pending) {
        pending = insertCoursewareOnWhiteboard(app, item);
        state.pending.set(key, pending);
      }
      try { id = await pending; }
      finally { if (state.pending.get(key) === pending) state.pending.delete(key); }
    }
    state.apps.set(key, id);
  }
  if (!app.manager.queryOne(id)) { state.apps.delete(key); throw new Error("CLASSROOM_DOCUMENT_NOT_CREATED"); }
  if (request === state.request && isCurrent()) {
    if (!writable()) throw new Error("WHITEBOARD_NOT_WRITABLE");
    app.manager.setMinimized(false);
    // Removing the per-window override restores its normal, non-minimized state.
    app.manager.setBoxStatus(id);
    app.manager.focusApp(id);
  }
  return id;
}
