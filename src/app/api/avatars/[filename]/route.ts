import { NextRequest, NextResponse } from "next/server";
import { getAliyunOssClient } from "@/lib/aliyun-oss";
import { avatarObjectKey } from "@/lib/avatar-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const objectKey = avatarObjectKey(filename);
  if (!objectKey) return new Response(null, { status: 404 });

  try {
    const url = getAliyunOssClient().signatureUrl(objectKey, { expires: 3600 });
    // Profile images are visible in shared courses. The UUID only exposes this
    // avatar object, while the OSS bucket can remain private.
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    return response;
  } catch (error) {
    console.error("Failed to read avatar:", error);
    return new Response(null, { status: 503 });
  }
}
