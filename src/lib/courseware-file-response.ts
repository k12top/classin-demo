import "server-only";
import { getCoursewareObjectKey, getCoursewareOssClient } from "./aliyun-oss";

const previewTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp4: "video/mp4", mp3: "audio/mpeg" };
export function coursewarePreviewType(ext: string) { return previewTypes[ext.toLowerCase()] || null; }

/** Serve bytes from our origin: navigating to a signed storage URL loses WeChat's classroom webview. */
export async function coursewareFileResponse(file: { url: string; name: string; ext?: string }, preview = false) {
  const ext = (file.ext || file.name.split(".").pop() || "").toLowerCase();
  const type = coursewarePreviewType(ext);
  if (preview && !type) return Response.json({ error: "preview_unavailable" }, { status: 415 });
  const objectKey = getCoursewareObjectKey(file.url);
  let source: string;
  if (objectKey) source = getCoursewareOssClient().signatureUrl(objectKey, { expires: 600 });
  else {
    const legacy = new URL(file.url);
    // Legacy storage objects only; never turn the authenticated endpoint into an arbitrary fetch proxy.
    const host = `${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`;
    if (legacy.protocol !== "https:" || legacy.hostname !== host || legacy.username || legacy.password || legacy.port) return Response.json({ error: "storage_url_invalid" }, { status: 502 });
    source = legacy.toString();
  }
  const response = await fetch(source, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) return Response.json({ error: "file_unavailable" }, { status: 502 });
  const filename = encodeURIComponent(file.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`);
  const headers = new Headers({
    "Content-Type": type || "application/octet-stream",
    "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  return new Response(response.body, { headers });
}
