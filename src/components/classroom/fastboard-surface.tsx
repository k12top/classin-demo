"use client";

import { useEffect, useRef, useState } from "react";
import type { FastboardApp } from "@netless/fastboard";
import type {
  ClassroomCoursewareSnapshot,
  ClassroomWhiteboardCredential,
} from "@/lib/classroom/types";
import { useTranslation } from "@/lib/i18n/context";

let fastboardModulePromise: Promise<typeof import("@netless/fastboard")> | null = null;

/** Start downloading the whiteboard runtime before a room credential arrives. */
export function preloadFastboard() {
  fastboardModulePromise ??= import("@netless/fastboard");
  return fastboardModulePromise;
}

type ConversionScene = {
  name: string;
  ppt?: { src: string; width?: number; height?: number };
};

type WhiteboardError = {
  key?: string;
  message?: string;
};

const EMPTY_CONVERSION_ERROR = "CLASSROOM_EMPTY_CONVERSION";

export type ClassroomWhiteboardTool =
  | "selector"
  | "clicker"
  | "pencil"
  | "text"
  | "rectangle"
  | "ellipse"
  | "eraser"
  | "laserPointer";

export type ClassroomWhiteboardController = {
  setTool(tool: ClassroomWhiteboardTool): void;
  setStrokeColor(color: [number, number, number]): void;
  setStrokeWidth(width: number): void;
  setTextSize(size: number): void;
  undo(): void;
  redo(): void;
  clear(): void;
  insertImage(dataUrl: string): Promise<void>;
  capture(): Promise<Blob>;
  exportBoard(): Promise<Blob>;
  importBoard(file: Blob): Promise<void>;
};

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("WHITEBOARD_CAPTURE_FAILED"));
    }, "image/png");
  });
}

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
  onControllerChange,
}: {
  credential: ClassroomWhiteboardCredential;
  courseware: ClassroomCoursewareSnapshot | null;
  onControllerChange?: (
    controller: ClassroomWhiteboardController | null,
  ) => void;
}) {
  const { t, locale } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<FastboardApp | null>(null);
  const activeToolRef = useRef<ClassroomWhiteboardTool>("selector");
  const insertedRef = useRef(new Set<string>());
  const [error, setError] = useState<WhiteboardError | null>(null);
  const [ready, setReady] = useState(false);
  const [launchAttempt, setLaunchAttempt] = useState(0);

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
    Object.assign(mountTarget.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      minHeight: "0",
    });
    let cancelled = false;
    let ui: { destroy(): void } | null = null;
    let app: FastboardApp | null = null;
    let writableCheckId: number | null = null;
    let writableTimedOut = false;
    let launchStarted = false;
    let resizeFrameId = 0;
    setReady(false);
    setError(null);
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        writableTimedOut = true;
        setError({ key: "classroom.v3.whiteboardLoadFailed" });
      }
    }, 12_000);
    const syncBoardViewport = () => {
      resizeFrameId = 0;
      const { width, height } = mountTarget.getBoundingClientRect();
      if (width > 0 && height > 0 && app) {
        const ratio = height / width;
        if (Math.abs(app.manager.containerSizeRatio - ratio) > 0.001) {
          app.manager.setContainerSizeRatio(ratio);
        }
      }
      window.dispatchEvent(new Event("resize"));
    };
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = window.requestAnimationFrame(syncBoardViewport);
    });
    resizeObserver.observe(mountTarget);
    let panCleanup: (() => void) | null = null;
    const startCanvasPan = (event: PointerEvent) => {
      const currentApp = appRef.current;
      if (
        activeToolRef.current !== "clicker" ||
        !currentApp?.canOperate ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const initialCamera = currentApp.camera.value;
      const move = (moveEvent: PointerEvent) => {
        const scale = Math.max(0.05, initialCamera.scale);
        currentApp.moveCamera({
          centerX: initialCamera.centerX - (moveEvent.clientX - startX) / scale,
          centerY: initialCamera.centerY - (moveEvent.clientY - startY) / scale,
        });
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        panCleanup = null;
      };
      panCleanup = end;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end, { once: true });
    };
    mountTarget.addEventListener("pointerdown", startCanvasPan, true);

    async function launch() {
      try {
        if (cancelled) return;
        const fastboard = await preloadFastboard();
        if (cancelled) return;
        const initialBounds = mountTarget.getBoundingClientRect();
        const initialContainerSizeRatio =
          initialBounds.width > 0 && initialBounds.height > 0
            ? initialBounds.height / initialBounds.width
            : 9 / 16;
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
            // WindowManager defaults to a centered 16:9 playground. The
            // classroom stage can be portrait or nearly square, so that
            // default leaves large visible regions outside the interactive
            // whiteboard. Match the actual stage and keep it synchronized in
            // the ResizeObserver below.
            containerSizeRatio: initialContainerSizeRatio,
            chessboard: false,
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
        ui = fastboard.mount(createdApp, mountTarget, {
          theme: "dark",
          language: locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en",
          force_show_toolbar: false,
          force_show_redo_undo: false,
          force_show_zoom_control: true,
          force_show_page_control: true,
          config: {
            toolbar: {
              enable: false,
              apps: { enable: false },
            },
            redo_undo: { enable: false },
            zoom_control: { enable: true },
            page_control: { enable: true },
          },
        });
        // The surrounding teaching stage can finish its Motion layout after
        // Fastboard mounts.  Ask the SDK to measure once the final canvas
        // bounds are available, otherwise it can keep the initial toolbar-
        // height viewport.
        requestAnimationFrame(() => {
          requestAnimationFrame(syncBoardViewport);
        });
        const publishControllerWhenReady = () => {
          if (cancelled || writableTimedOut) return;
          // canOperate is true only after the room is connected and has a
          // writer token.  setAppliance before then is silently ignored by
          // the SDK, which was the cause of the highlighted-but-inert tools.
          if (credential.writable && !createdApp.canOperate) {
            writableCheckId = window.setTimeout(publishControllerWhenReady, 150);
            return;
          }
          if (credential.writable) {
            onControllerChange?.({
              setTool: (tool) => {
                activeToolRef.current = tool;
                mountTarget.dataset.whiteboardTool = tool;
                createdApp.setAppliance(tool === "clicker" ? "selector" : tool);
              },
              setStrokeColor: (color) => {
                createdApp.setStrokeColor(color);
                createdApp.setTextColor(color);
              },
              setStrokeWidth: (width) => createdApp.setStrokeWidth(width),
              setTextSize: (size) => createdApp.setTextSize(size),
              undo: () => createdApp.undo(),
              redo: () => createdApp.redo(),
              clear: () => createdApp.cleanCurrentScene(),
              insertImage: (dataUrl) => createdApp.insertImage(dataUrl),
              capture: async () => {
                const width = Math.max(640, Math.round(mountTarget.clientWidth || 1280));
                const height = Math.max(360, Math.round(mountTarget.clientHeight || 720));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("WHITEBOARD_CAPTURE_FAILED");
                const { scenePath } = createdApp.room.state.sceneState;
                await createdApp.room.screenshotToCanvasAsync(
                  context,
                  scenePath,
                  width,
                  height,
                  createdApp.room.state.cameraState,
                );
                return canvasBlob(canvas);
              },
              exportBoard: () =>
                createdApp.room.exportScene(
                  createdApp.room.state.sceneState.scenePath,
                ),
              importBoard: async (file) => {
                const imported = await createdApp.room.importScene(
                  "/classroom-imports",
                  file,
                );
                createdApp.room.setScenePath(
                  `/classroom-imports/${imported.name}`,
                );
              },
            });
          }
          window.clearTimeout(timeoutId);
          setError(null);
          setReady(true);
        };
        publishControllerWhenReady();
      } catch (launchError) {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setError(
          launchError instanceof Error
            ? { message: launchError.message }
            : { key: "classroom.v3.whiteboardLoadFailed" },
        );
      }
    }
    // React Strict Mode mounts and immediately cleans up effects once in
    // development. Queueing Fastboard synchronously made that throwaway
    // mount open a Netless room, then forced the real classroom to wait for
    // its connection and teardown. Deferring one task lets the fake mount
    // cancel before any SDK or network work begins.
    const launchTimerId = window.setTimeout(() => {
      launchStarted = true;
      void enqueueFastboardLifecycle(launch);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(launchTimerId);
      window.clearTimeout(timeoutId);
      if (writableCheckId !== null) window.clearTimeout(writableCheckId);
      window.cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      panCleanup?.();
      mountTarget.removeEventListener("pointerdown", startCanvasPan, true);
      setReady(false);
      onControllerChange?.(null);
      if (!launchStarted) {
        if (mountTarget.isConnected) mountTarget.replaceChildren();
        return;
      }
      void enqueueFastboardLifecycle(async () => {
        try {
          ui?.destroy();
        } catch (destroyUiError) {
          console.warn(
            "[ClassroomWhiteboard] Failed to destroy Fastboard UI",
            destroyUiError,
          );
        }
        ui = null;
        const mountedApp = app;
        app = null;
        if (appRef.current === mountedApp) appRef.current = null;
        try {
          await mountedApp?.destroy();
        } finally {
          if (mountTarget.isConnected) mountTarget.replaceChildren();
        }
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
    launchAttempt,
    locale,
    onControllerChange,
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
    const pending = credential.error === "whiteboard_pending";
    return (
      <div className="classroom-v3-board-state">
        {pending ? (
          <span className="classroom-v3-board-loader" />
        ) : (
          <span className="classroom-v3-board-mark">W</span>
        )}
        <strong>
          {t(
            pending
              ? "classroom.v3.enteringWhiteboard"
              : "classroom.v3.whiteboardDisconnected",
          )}
        </strong>
        {!pending && (
          <p>{credential.error || t("classroom.v3.whiteboardConfigureHint")}</p>
        )}
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
      {error && !ready && (
        <div className="classroom-v3-board-state is-overlay is-error" role="alert">
          <span className="classroom-v3-board-mark">W</span>
          <strong>{t("classroom.v3.whiteboardLoadFailed")}</strong>
          <p>{error.key ? t(error.key) : error.message}</p>
          <button type="button" onClick={() => setLaunchAttempt((value) => value + 1)}>
            {t("classroom.v3.retry")}
          </button>
        </div>
      )}
      {error && ready && (
        <div className="classroom-v3-board-toast is-error">
          {error.key ? t(error.key) : error.message}
        </div>
      )}
    </div>
  );
}
