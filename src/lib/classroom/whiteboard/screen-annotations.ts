import type { ApplianceNames, Room, View } from "white-web-sdk";
import type { ClassroomWhiteboardController } from "@/components/classroom/fastboard-surface";

const ANNOTATION_WIDTH = 1280;

/** Match the contained video, including letterboxing, on every viewer's stage. */
export function screenAnnotationViewport(
  stage: { width: number; height: number },
  video: { width: number; height: number },
) {
  const ratio = video.width > 0 && video.height > 0 ? video.height / video.width : 9 / 16;
  const width = Math.max(0, Math.min(stage.width, stage.height / ratio));
  const height = width * ratio;
  return {
    left: (stage.width - width) / 2,
    top: (stage.height - height) / 2,
    width,
    height,
    scale: width / ANNOTATION_WIDTH,
  };
}

export function createScreenAnnotationView(room: Room, screenId: string, writable: boolean) {
  if (room.phase !== "connected") return null;
  const directory = `/screen-annotations/${encodeURIComponent(screenId)}`;
  const scenePath = `${directory}/annotations`;
  if (room.scenePathType(scenePath) !== "page") {
    if (!writable || !room.isWritable || room.phase !== "connected") return null;
    room.putScenes(directory, [{ name: "annotations" }]);
  }
  const view = room.views.createView();
  // A screen must stay fixed to the video even when the teacher pans the board.
  view.mode = 2; // ViewVisionMode.Freedom; avoid loading the browser SDK at SSR.
  view.disableCameraTransform = true;
  view.disableKey = true;
  view.focusScenePath = scenePath;
  return view;
}

export function createScreenAnnotationController(
  room: Room,
  view: View,
  target: HTMLDivElement,
  isActive: () => boolean = () => true,
): ClassroomWhiteboardController {
  const operate = (action: () => void) => {
    if (isActive() && room.isWritable && room.phase === "connected") action();
  };
  return {
    setTool(tool) {
      target.dataset.whiteboardTool = tool;
      operate(() => { view.setMemberState({ currentApplianceName: (tool === "clicker" ? "selector" : tool === "eraser" ? "pencilEraser" : tool) as ApplianceNames }); });
    },
    setStrokeColor: (color) => operate(() => { view.setMemberState({ strokeColor: color, textColor: color }); }),
    setStrokeWidth: (width) => operate(() => { view.setMemberState({ strokeWidth: width }); }),
    setEraserSize: (size) => operate(() => { view.setMemberState({ pencilEraserSize: size }); }),
    setTextSize: (size) => operate(() => { view.setMemberState({ textSize: size }); }),
    undo: () => operate(() => { view.undo(); }),
    redo: () => operate(() => { view.redo(); }),
    clear: () => operate(() => { view.cleanCurrentScene(); }),
    async insertImage(dataUrl) {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const uuid = crypto.randomUUID();
      const width = Math.min(640, image.naturalWidth);
      const height = width * image.naturalHeight / image.naturalWidth;
      operate(() => {
        view.insertImage({ uuid, centerX: 0, centerY: 0, width, height, locked: false });
        view.completeImageUpload(uuid, dataUrl);
      });
    },
    async capture() {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(target.clientWidth));
      canvas.height = Math.max(1, Math.round(target.clientHeight));
      const context = canvas.getContext("2d");
      if (!context || !view.focusScenePath) throw new Error("WHITEBOARD_SCENE_NOT_READY");
      await view.screenshotToCanvasAsync(context, view.focusScenePath, canvas.width, canvas.height, view.camera);
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("WHITEBOARD_CAPTURE_FAILED")), "image/png"));
    },
    exportBoard: () => {
      if (!view.focusScenePath) return Promise.reject(new Error("WHITEBOARD_SCENE_NOT_READY"));
      return room.exportScene(view.focusScenePath);
    },
    // Board imports belong to the teaching board; never redirect a screen view
    // to a scene that other viewers are not displaying.
    importBoard: () => Promise.reject(new Error("SCREEN_ANNOTATION_IMPORT_UNSUPPORTED")),
  };
}
