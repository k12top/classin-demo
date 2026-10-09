"use client";

import { useEffect, useRef } from "react";
import type { FastboardApp } from "@netless/fastboard";
import type { View } from "white-web-sdk";
import type { ClassroomWhiteboardController } from "./fastboard-surface";
import {
  createScreenAnnotationController,
  createScreenAnnotationView,
  screenAnnotationViewport,
} from "@/lib/classroom/whiteboard/screen-annotations";

export function ScreenShareAnnotations({ app, screenId, writable, onControllerChange }: {
  app: FastboardApp | null;
  screenId: string;
  writable: boolean;
  onControllerChange: (controller: ClassroomWhiteboardController | null) => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = targetRef.current;
    const stage = target?.parentElement;
    if (!app || !target || !stage) return;
    let view: View | null = null;
    let controller: ClassroomWhiteboardController | null = null;
    let video: HTMLVideoElement | null = null;
    let disposed = false;
    let frame = 0;
    const syncViewport = () => {
      frame = 0;
      const nextVideo = stage.querySelector("video");
      if (video !== nextVideo) {
        video?.removeEventListener("resize", scheduleViewport);
        video?.removeEventListener("loadedmetadata", scheduleViewport);
        video = nextVideo;
        video?.addEventListener("resize", scheduleViewport);
        video?.addEventListener("loadedmetadata", scheduleViewport);
      }
      const viewport = screenAnnotationViewport(
        { width: stage.clientWidth, height: stage.clientHeight },
        { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 },
      );
      Object.assign(target.style, { left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${viewport.width}px`, height: `${viewport.height}px` });
      if (view && app.room.phase === "connected" && viewport.scale > 0) {
        view.refresh();
        view.moveCamera({ centerX: 0, centerY: 0, scale: viewport.scale });
      }
    };
    function scheduleViewport() {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncViewport);
    }
    const mountView = () => {
      if (disposed || view) return;
      view = createScreenAnnotationView(app.room, screenId, writable);
      if (!view) return; // Readonly viewers wait for a writer to create the scene.
      view.divElement = target;
      if (writable) {
        controller = createScreenAnnotationController(app.room, view, target, () => !disposed);
        onControllerChange(controller);
      }
      scheduleViewport();
    };
    const syncConnection = () => {
      if (app.room.phase !== "connected") {
        onControllerChange(null);
        return;
      }
      if (view) onControllerChange(controller);
      else mountView();
      scheduleViewport();
    };
    const resizeObserver = new ResizeObserver(scheduleViewport);
    resizeObserver.observe(stage);
    const mediaObserver = new MutationObserver(() => {
      if (stage.querySelector("video") !== video) scheduleViewport();
    });
    mediaObserver.observe(stage, { childList: true, subtree: true });
    app.room.callbacks.on("onRoomStateChanged", mountView);
    app.room.callbacks.on("onPhaseChanged", syncConnection);
    const sceneTimer = window.setInterval(mountView, 500);
    mountView();
    scheduleViewport();
    return () => {
      disposed = true;
      clearInterval(sceneTimer);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mediaObserver.disconnect();
      video?.removeEventListener("resize", scheduleViewport);
      video?.removeEventListener("loadedmetadata", scheduleViewport);
      app.room.callbacks.off("onRoomStateChanged", mountView);
      app.room.callbacks.off("onPhaseChanged", syncConnection);
      onControllerChange(null);
      // The SDK releases all views itself on a terminal room disconnect.
      if (app.room.phase !== "disconnected") view?.release();
    };
  }, [app, screenId, writable, onControllerChange]);

  return <div ref={targetRef} className="classroom-v3-screen-annotations" data-writable={writable} />;
}
