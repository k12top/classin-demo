import type { ClassroomCoursewareSnapshot } from "./types";

type Conversion = { prefix?: string; scenes?: { name?: string; ppt?: { src?: string; width?: number; height?: number } }[] };
type DocumentInput = { fileType: "pptx"; scenePath: string; taskId: string; url: string; title: string } | { fileType: "pdf"; scenePath: string; scenes: { name: string; ppt: { src: string; width: number; height: number } }[]; title: string };

/** Success means the SDK insertion promise resolved, not merely HTTP acceptance. */
export async function insertCoursewareOnWhiteboard(app: { insertDocs: (input: DocumentInput) => Promise<unknown> }, item: ClassroomCoursewareSnapshot) {
  const conversion = item.conversion as Conversion | null;
  if (!item.whiteboardEnabled || item.taskStatus !== "Finished" || !item.taskUuid) throw new Error("courseware_not_ready");
  let appId: unknown;
  const scenePath = `/courseware/${encodeURIComponent(item.id)}/${encodeURIComponent(item.taskUuid)}`;
  if (item.type === "dynamic") {
    if (!conversion?.prefix) throw new Error("CLASSROOM_EMPTY_CONVERSION");
    appId = await app.insertDocs({ fileType: "pptx", scenePath, taskId: item.taskUuid, url: conversion.prefix, title: item.name });
  } else {
    const scenes = (conversion?.scenes || []).flatMap((scene, index) => scene.ppt?.src ? [{ name: scene.name || String(index + 1), ppt: { src: scene.ppt.src, width: scene.ppt.width || 1280, height: scene.ppt.height || 720 } }] : []);
    if (!scenes.length) throw new Error("CLASSROOM_EMPTY_CONVERSION");
    appId = await app.insertDocs({ fileType: "pdf", scenePath, scenes, title: item.name });
  }
  if (typeof appId !== "string" || !appId) throw new Error("CLASSROOM_DOCUMENT_NOT_CREATED");
  return appId;
}
