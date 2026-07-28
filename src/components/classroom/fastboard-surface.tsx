"use client";

import { useEffect, useRef, useState } from "react";
import type { FastboardApp } from "@netless/fastboard";
import type {
  ClassroomCoursewareSnapshot,
  ClassroomWhiteboardCredential,
} from "@/lib/classroom/types";
import { useTranslation } from "@/lib/i18n/context";

type ConversionScene = {
  name: string;
  ppt?: { src: string; width?: number; height?: number };
};

type WhiteboardError = {
  key?: string;
  message?: string;
};

const EMPTY_CONVERSION_ERROR = "CLASSROOM_EMPTY_CONVERSION";

// Fastboard owns a process-wide WindowManager. React Strict Mode and fast
// refresh can otherwise overlap one instance's async destroy with the next
// instance's create, which produces "Already created cannot be created again".
let fastboardLifecycle: Promise<void> = Promise.resolve();

function enqueueFastboardLifecycle(task: () => Promise<void>) {
  const run = fastboardLifecycle.then(task, task);
  fastboardLifecycle = run.catch(() => undefined);
  return run;
}

export function FastboardSurface({
  credential,
  courseware,
}: {
  credential: ClassroomWhiteboardCredential;
  courseware: ClassroomCoursewareSnapshot | null;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<FastboardApp | null>(null);
  const insertedRef = useRef(new Set<string>());
  const [error, setError] = useState<WhiteboardError | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (
      !container ||
      !credential.enabled ||
      !credential.appIdentifier ||
      !credential.region ||
      !credential.roomUuid ||
      !credential.roomToken
    ) {
      return;
    }
    const mountTarget = container;
    let cancelled = false;
    let ui: { destroy(): void } | null = null;
    let app: FastboardApp | null = null;

    async function launch() {
      try {
        if (cancelled) return;
        const fastboard = await import("@netless/fastboard");
        if (cancelled) return;
        const createdApp = await fastboard.createFastboard({
          sdkConfig: {
            appIdentifier: credential.appIdentifier!,
            region: credential.region!,
          },
          joinRoom: {
            uid: `web-${crypto.randomUUID()}`,
            uuid: credential.roomUuid!,
            roomToken: credential.roomToken!,
            isWritable: credential.writable,
            disableDeviceInputs: !credential.writable,
          },
          managerConfig: {
            cursor: true,
            builtinAppOptions: {
              Presentation: {
                useScrollbar: true,
                debounceSync: true,
              },
            },
          },
        });
        app = createdApp;
        if (cancelled) {
          app = null;
          await createdApp.destroy();
          return;
        }
        appRef.current = createdApp;
        ui = fastboard.mount(createdApp, mountTarget);
        setReady(true);
      } catch (launchError) {
        if (cancelled) return;
        setError(
          launchError instanceof Error
            ? { message: launchError.message }
            : { key: "classroom.v3.whiteboardLoadFailed" },
        );
      }
    }
    void enqueueFastboardLifecycle(launch);
    return () => {
      cancelled = true;
      setReady(false);
      void enqueueFastboardLifecycle(async () => {
        ui?.destroy();
        ui = null;
        const mountedApp = app;
        app = null;
        if (appRef.current === mountedApp) appRef.current = null;
        await mountedApp?.destroy();
      }).catch((destroyError: unknown) => {
        console.warn("[ClassroomWhiteboard] Failed to destroy Fastboard", destroyError);
      });
    };
  }, [
    credential.appIdentifier,
    credential.enabled,
    credential.region,
    credential.roomToken,
    credential.roomUuid,
    credential.writable,
  ]);

  useEffect(() => {
    const app = appRef.current;
    if (
      !app ||
      !ready ||
      !credential.writable ||
      !courseware ||
      !courseware.whiteboardEnabled ||
      courseware.taskStatus !== "Finished" ||
      !courseware.taskUuid ||
      insertedRef.current.has(courseware.id)
    ) {
      return;
    }
    const conversion = courseware.conversion as
      | { scenes?: ConversionScene[] }
      | null;
    async function insert() {
      try {
        if (courseware!.type === "dynamic") {
          await app!.insertDocs({
            fileType: "pptx",
            scenePath: `/courseware/${courseware!.id}`,
            taskId: courseware!.taskUuid!,
            title: courseware!.name,
          });
        } else {
          const scenes = (conversion?.scenes || [])
            .filter((scene) => scene.ppt?.src)
            .map((scene, index) => ({
              name: scene.name || String(index + 1),
              ppt: {
                src: scene.ppt!.src,
                width: scene.ppt!.width || 1280,
                height: scene.ppt!.height || 720,
              },
            }));
          if (scenes.length === 0) {
            throw new Error(EMPTY_CONVERSION_ERROR);
          }
          await app!.insertDocs({
            fileType: "pdf",
            scenePath: `/courseware/${courseware!.id}`,
            scenes,
            title: courseware!.name,
          });
        }
        insertedRef.current.add(courseware!.id);
      } catch (insertError) {
        setError(
          insertError instanceof Error &&
            insertError.message !== EMPTY_CONVERSION_ERROR
            ? { message: insertError.message }
            : {
                key:
                  insertError instanceof Error
                    ? "classroom.v3.conversionEmpty"
                    : "classroom.v3.addToWhiteboardFailed",
              },
        );
      }
    }
    void insert();
  }, [courseware, credential.writable, ready]);

  if (!credential.enabled) {
    return (
      <div className="classroom-v3-board-state">
        <span className="classroom-v3-board-mark">W</span>
        <strong>{t("classroom.v3.whiteboardDisconnected")}</strong>
        <p>{credential.error || t("classroom.v3.whiteboardConfigureHint")}</p>
      </div>
    );
  }

  return (
    <div className="classroom-v3-board">
      <div ref={containerRef} className="classroom-v3-board-canvas" />
      {!ready && !error && (
        <div className="classroom-v3-board-state is-overlay">
          <span className="classroom-v3-board-loader" />
          <strong>{t("classroom.v3.enteringWhiteboard")}</strong>
        </div>
      )}
      {courseware &&
        courseware.whiteboardEnabled &&
        courseware.taskStatus !== "Finished" && (
          <div className="classroom-v3-board-toast">
            {courseware.taskStatus === "Failed"
              ? courseware.conversionError || t("classroom.v3.conversionFailed")
              : t("classroom.v3.convertingCourseware", {
                  name: courseware.name,
                })}
          </div>
        )}
      {error && (
        <div className="classroom-v3-board-toast is-error">
          {error.key ? t(error.key) : error.message}
        </div>
      )}
    </div>
  );
}
