"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { ClassroomSyncScheduler } from "@/lib/classroom/sync-scheduler";
import { workspaceRequest } from "@/lib/workspace-client";
import { WORKSPACE_LESSON_CHANGED_EVENT } from "@/lib/workspace-lesson-events";
import type { WorkspaceCourse } from "@/lib/workspace-model";
import { WORKSPACE_REFRESH_INTERVAL_MS } from "@/lib/workspace-refresh";

type CourseState = {
  owner: string;
  courses: WorkspaceCourse[];
  loading: boolean;
  error: string;
  offline: boolean;
  expired: boolean;
};
const emptyState = (owner: string): CourseState => ({ owner, courses: [], loading: true, error: "", offline: false, expired: false });

/** One account-bound reader for the home and detail-page workspace shells.
 * Cached desktop results stay visible while recovery continues; they are not a
 * successful network refresh. Writes never run here; authorization failures
 * do not enter the fast retry loop.
 */
export function useWorkspaceCourses(accountId: string, desktopCache = false) {
  const [state, setState] = useState<CourseState>(() => emptyState(""));
  const active = useRef<{ owner: string; scheduler: ClassroomSyncScheduler } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const scheduler = new ClassroomSyncScheduler();
    active.current = { owner: accountId, scheduler };
    // Permit one initial read, including an existing SQLite snapshot when the
    // window starts offline. All subsequent reads respect online/visibility.
    let initialRead = true;
    const environment = (resume = false) => scheduler.environment(navigator.onLine || initialRead, document.visibilityState === "visible", resume);
    const read = async (signal: AbortSignal) => {
      initialRead = false;
      setState(previous => previous.owner === accountId ? { ...previous, loading: true } : emptyState(accountId));
      let snapshot: { courses: WorkspaceCourse[]; cached: boolean };
      try {
        const desktop = desktopCache ? window.classroomDesktop?.getCachedCourses : undefined;
        if (desktop) {
          const result = await desktop(accountId);
          signal.throwIfAborted();
          if (!result?.ok) throw Object.assign(new Error(result?.error || "Unable to load courses"), { status: result?.status });
          if (!Array.isArray(result.data?.courses)) throw Object.assign(new Error("Invalid course response"), { status: 502 });
          snapshot = { courses: result.data.courses, cached: Boolean(result.cached) };
        } else {
          const result = await workspaceRequest<{ courses: WorkspaceCourse[] }>("/api/courses", { signal });
          if (!Array.isArray(result?.courses)) throw Object.assign(new Error("Invalid course response"), { status: 502 });
          snapshot = { courses: result.courses, cached: false };
        }
      } catch (error) {
        if (signal.aborted) return;
        const status = (error as { status?: number } | null)?.status;
        if (status === 401) {
          setState({ ...emptyState(accountId), loading: false, expired: true });
          scheduler.stop();
          redirectToSsoLogin();
          return;
        }
        setState(previous => ({
          owner: accountId,
          courses: [403, 404, 409].includes(status ?? 0) ? [] : previous.owner === accountId ? previous.courses : [],
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load courses",
          offline: false,
          expired: false,
        }));
        if (!status || status === 408 || status === 429 || status >= 500) throw error;
        return;
      } finally {
        environment();
      }
      if (signal.aborted) return;
      setState({ owner: accountId, courses: snapshot.courses, loading: false, error: snapshot.cached ? "offline-cache" : "", offline: snapshot.cached, expired: false });
      if (snapshot.cached) throw new Error("Course cache needs revalidation");
    };
    scheduler.register({ topics: ["courses"], run: read, initialDelay: 0, interval: () => WORKSPACE_REFRESH_INTERVAL_MS, maxRetryMs: 8_000 });
    const resume = () => environment(true);
    const connection = () => environment();
    const changed = () => scheduler.refresh("courses");
    window.addEventListener("focus", resume);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener(WORKSPACE_LESSON_CHANGED_EVENT, changed);
    document.addEventListener("visibilitychange", connection);
    environment();
    scheduler.start();
    return () => {
      scheduler.stop();
      if (active.current?.scheduler === scheduler) active.current = null;
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener(WORKSPACE_LESSON_CHANGED_EVENT, changed);
      document.removeEventListener("visibilitychange", connection);
    };
  }, [accountId, desktopCache]);

  const refresh = useCallback(() => {
    if (active.current?.owner === accountId) active.current.scheduler.refresh("courses");
  }, [accountId]);
  // An old account's data never reaches the new account, even before cleanup.
  return { ...(state.owner === accountId ? state : emptyState(accountId)), refresh };
}
