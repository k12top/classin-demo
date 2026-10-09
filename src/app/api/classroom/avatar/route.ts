import { googleClassroomAvatarUrl } from "@/lib/classroom/avatar";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
const MAX_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
  const url = googleClassroomAvatarUrl(request.nextUrl.searchParams.get("url") || "");
  if (!url) return new Response(null, { status: 400 });
  try {
    const upstream = await fetch(url, {
      redirect: "error", signal: AbortSignal.timeout(5_000),
      next: { revalidate: 86_400 },
    });
    const contentType = upstream.headers.get("content-type")?.split(";")[0] || "";
    if (!upstream.ok || !/^image\/(png|jpeg|webp|gif|avif)$/.test(contentType) ||
      Number(upstream.headers.get("content-length")) > MAX_BYTES) {
      await upstream.body?.cancel();
      return new Response(null, { status: 502 });
    }
    const reader = upstream.body?.getReader();
    if (!reader) return new Response(null, { status: 502 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return new Response(null, { status: 502 }); }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(body, { headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-if-error=604800",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response(null, { status: 502 }); }
}
