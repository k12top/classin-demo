import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { MAX_AVATAR_SIZE, validateAvatarFile } from "../src/lib/avatar-upload";
import { presetAvatarSource } from "../src/lib/user-avatar";
import { loadModule } from "./helpers/load-module";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD3sAAAAASUVORK5CYII=", "base64");
const session = { userId: "org/person", name: "person", displayName: "Person", role: "student", email: "person@example.com", avatar: "old" };
class StorageConfigurationError extends Error {}

function fixture(options: { authorized?: boolean; storageFailure?: boolean } = {}) {
  const uploads: Array<{ key: string; bytes: Buffer; mime: string }> = [];
  const writes: Array<{ model: string; args: Record<string, unknown> }> = [];
  let profile: Record<string, unknown> | undefined;
  let cookieAvatar: string | undefined;
  const oss = {
    put: async (key: string, bytes: Buffer, putOptions: { mime: string }) => {
      if (options.storageFailure) throw new StorageConfigurationError("not configured");
      uploads.push({ key, bytes, mime: putOptions.mime });
    },
    signatureUrl: (key: string, signOptions: { expires: number }) => {
      assert.equal(signOptions.expires, 3600);
      return `https://storage.example.com/${key}?fixture-signature`;
    },
  };
  const storage = loadModule<{
    storeAvatar(bytes: Buffer, contentType: string): Promise<string>;
    matchesAvatarContentType(bytes: Uint8Array, contentType: string): boolean;
    avatarObjectKey(filename: string): string | null;
  }>("src/lib/avatar-storage.ts", { "@/lib/aliyun-oss": { getAliyunOssClient: () => oss } });
  const prisma = Object.fromEntries([
    "course", "courseTeacher", "courseStudent", "groupMember",
    "courseSession", "courseSessionTeacher", "courseSessionStudent",
  ].map((model) => [model, { updateMany: (args: Record<string, unknown>) => {
    writes.push({ model, args });
    return Promise.resolve({ count: 1 });
  } }]));
  const route = loadModule<{ PUT(request: NextRequest): Promise<Response> }>("src/app/api/auth/avatar/route.ts", {
    "@/lib/db": { prisma: { ...prisma, $transaction: (operations: Promise<unknown>[]) => Promise.all(operations) } },
    "@/lib/course-teacher": { casdoorUserIdCandidates: () => ["org/person", "person"] },
    "@/lib/session": {
      getSessionFromRequest: async () => options.authorized === false ? null : session,
      buildSessionCookies: async (value: { avatar: string }) => { cookieAvatar = value.avatar; return "fixture"; },
      attachSessionCookies: (response: Response) => response.headers.set("set-cookie", "session=fixture; HttpOnly"),
    },
    "@/lib/user-profile": { upsertUserProfileAvatar: async (value: Record<string, unknown>) => { profile = value; } },
    "@/lib/avatar-upload": { MAX_AVATAR_SIZE, validateAvatarFile },
    "@/lib/user-avatar": { presetAvatarSource },
    "@/lib/avatar-storage": storage,
    "@/lib/aliyun-oss": { CoursewareStorageConfigurationError: StorageConfigurationError },
  }, { console: { error() {} } });
  const imageRoute = loadModule<{ GET(request: NextRequest, context: { params: Promise<{ filename: string }> }): Promise<Response> }>("src/app/api/avatars/[filename]/route.ts", {
    "@/lib/aliyun-oss": { getAliyunOssClient: () => oss },
    "@/lib/avatar-storage": storage,
  });
  return { route, imageRoute, storage, uploads, writes, profile: () => profile, cookieAvatar: () => cookieAvatar };
}

function request(file?: File | string) {
  const body = new FormData();
  if (file !== undefined) body.append("file", file);
  return new NextRequest("http://localhost/api/auth/avatar", { method: "PUT", body });
}

test("uploads raster bytes and saves a durable avatar across profile, roster and session cookies", async () => {
  const f = fixture();
  const response = await f.route.PUT(request(new File([png], "photo.png", { type: "image/png" })));
  assert.equal(response.status, 200);
  const { avatar } = await response.json();
  assert.match(avatar, /^\/api\/avatars\/[0-9a-f-]+\.png$/);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].key, avatar.replace("/api/", ""));
  assert.deepEqual(f.uploads[0].bytes, png);
  assert.equal(f.uploads[0].mime, "image/png");
  assert.equal(f.profile()?.userId, session.userId);
  assert.equal(f.profile()?.avatar, avatar);
  assert.equal(f.cookieAvatar(), avatar);
  assert.match(response.headers.get("set-cookie") || "", /session=fixture/);
  assert.equal(f.writes.length, 8);
  for (const write of f.writes) {
    assert.deepEqual(Object.values(write.args.data as object), [avatar]);
    assert.deepEqual(Object.values(write.args.where as object), [{ in: ["org/person", "person"] }]);
  }
  const image = await f.imageRoute.GET(new NextRequest(`http://localhost${avatar}`), {
    params: Promise.resolve({ filename: avatar.split("/").pop() }),
  });
  assert.equal(image.status, 307);
  assert.equal(image.headers.get("location"), `https://storage.example.com/${f.uploads[0].key}?fixture-signature`);
  assert.equal(image.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
});

test("rejects unauthenticated uploads before accessing storage or profile", async () => {
  const f = fixture({ authorized: false });
  assert.equal((await f.route.PUT(request(new File([png], "photo.png", { type: "image/png" })))).status, 401);
  assert.equal(f.uploads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.profile(), undefined);
});

test("rejects missing, oversized, unsupported and MIME-spoofed files without changing the avatar", async () => {
  for (const [file, status, code] of [
    [undefined, 400, "AVATAR_FILE_REQUIRED"],
    ["not a file", 400, "AVATAR_FILE_REQUIRED"],
    [new File([], "empty.png", { type: "image/png" }), 400, "AVATAR_FILE_REQUIRED"],
    [new File([new Uint8Array(MAX_AVATAR_SIZE + 1)], "large.png", { type: "image/png" }), 413, "AVATAR_FILE_TOO_LARGE"],
    [new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" }), 400, "AVATAR_FILE_TYPE_INVALID"],
    [new File(["<script>alert(1)</script>"], "photo.png", { type: "image/png" }), 400, "AVATAR_FILE_TYPE_INVALID"],
    [new File([png], "photo.jpg", { type: "image/jpeg" }), 400, "AVATAR_FILE_TYPE_INVALID"],
  ] as const) {
    const f = fixture();
    const response = await f.route.PUT(request(file));
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.profile(), undefined);
    assert.equal(f.writes.length, 0);
  }
});

test("malformed multipart and excessive content length return actionable errors", async () => {
  const f = fixture();
  const broken = new NextRequest("http://localhost/api/auth/avatar", {
    method: "PUT", headers: { "content-type": "multipart/form-data; boundary=missing" }, body: "broken",
  });
  assert.equal((await f.route.PUT(broken)).status, 400);
  const tooLarge = request();
  tooLarge.headers.set("content-length", String(MAX_AVATAR_SIZE + 65537));
  assert.equal((await f.route.PUT(tooLarge)).status, 413);
  assert.equal(f.uploads.length, 0);
});

test("missing OSS configuration preserves the previous avatar and reports temporary unavailability", async () => {
  const f = fixture({ storageFailure: true });
  const response = await f.route.PUT(request(new File([png], "photo.png", { type: "image/png" })));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AVATAR_STORAGE_UNAVAILABLE");
  assert.equal(f.profile(), undefined);
  assert.equal(f.writes.length, 0);
});

test("existing JSON avatar updates and clearing remain compatible", async () => {
  for (const avatar of ["https://example.com/photo.png", ""]) {
    const f = fixture();
    const response = await f.route.PUT(new NextRequest("http://localhost/api/auth/avatar", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ avatar }),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).avatar, avatar);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.cookieAvatar(), avatar);
  }
});

test("avatar reads cannot sign arbitrary objects in the private bucket", async () => {
  const f = fixture();
  for (const filename of ["../courseware/private.pdf", "not-a-uuid.png", "11111111-1111-4111-8111-111111111111.svg"]) {
    assert.equal((await f.imageRoute.GET(new NextRequest("http://localhost/api/avatars/invalid"), {
      params: Promise.resolve({ filename }),
    })).status, 404);
  }
});


test("trusted avatar presets and initials persist without requiring OSS; unknown presets are rejected", async () => {
  for (const preset of ["initials", "book", "waves", "../../arbitrary", "https://other.example/avatar.svg"]) {
    const f = fixture();
    const response = await f.route.PUT(new NextRequest("http://localhost/api/auth/avatar", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preset }),
    }));
    const expected = presetAvatarSource(preset);
    assert.equal(response.status, expected === null ? 400 : 200);
    assert.equal(f.uploads.length, 0);
    if (expected !== null) { assert.equal((await response.json()).avatar, expected); assert.equal(f.profile()?.avatar, expected); }
    else assert.equal(f.profile(), undefined);
  }
});
