/* eslint-disable @typescript-eslint/no-require-imports -- Isolated upstream and RTM fixtures exercise real modules. */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const fs = require("node:fs/promises");
const test = require("node:test");
const root = path.resolve(__dirname, "../..");
const output = path.join(root, "node_modules/.cache/classroom-avatar-signaling.cjs");
const compiled = (async () => {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "agora-rtm": `export default {RTM:class {constructor(appId,userId){this.userId=userId;globalThis.fixtureRtm=this;}addEventListener(name,listener){this.listener=listener;}async login(){}async subscribe(){}async publish(){}async unsubscribe(){}async logout(){}}};`,
  };
  await esbuild.build({ stdin: { contents: `export {GET} from '@/app/api/classroom/avatar/route';export {AgoraRtmSignalingProvider} from '@/lib/classroom/signaling/agora-client';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "upstream-fixtures", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  return require(output);
})();
const request = source => ({ nextUrl: new URL(`http://localhost/api/classroom/avatar?url=${encodeURIComponent(source)}`) });
const google = "https://lh3.googleusercontent.com/a-/fixture=s96-c";

test("avatar response enforces fixed destinations, image types, byte limits and cache headers", async () => {
  const { GET } = await compiled;
  const original = global.fetch;
  let calls = 0;
  try {
    global.fetch = async (_url, options) => { calls++; assert.equal(options.redirect, "error"); assert.equal(options.next.revalidate, 86400); return new Response(Uint8Array.from([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }); };
    assert.equal((await GET(request("http://127.0.0.1/a/profile"))).status, 400);
    assert.equal(calls, 0, "invalid sources must never reach fetch");
    const valid = await GET(request(google));
    assert.equal(valid.status, 200); assert.equal(valid.headers.get("content-type"), "image/png");
    assert.match(valid.headers.get("cache-control"), /max-age=86400/);
    assert.equal(valid.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await valid.arrayBuffer()).byteLength, 4);
    for (const type of ["text/html", "image/svg+xml"]) {
      global.fetch = async () => new Response("untrusted", { headers: { "content-type": type } });
      assert.equal((await GET(request(google))).status, 502);
    }
    global.fetch = async () => new Response(new Uint8Array(512 * 1024 + 1), { headers: { "content-type": "image/png" } });
    assert.equal((await GET(request(google))).status, 502, "streams are bounded even without a content-length header");
    global.fetch = async () => { throw new Error("network unavailable"); };
    assert.equal((await GET(request(google))).status, 502);
  } finally { global.fetch = original; }
});

test("RTM passes the authenticated publisher separately from untrusted message fields", async () => {
  const { AgoraRtmSignalingProvider } = await compiled;
  const provider = new AgoraRtmSignalingProvider(), received = [];
  await provider.connect({ appId: "fixture", userId: "student:tab", token: "fixture", channelName: "lesson" }, (event, publisher) => received.push({ event, publisher }));
  const patch = { courseId: "lesson", topic: "member-permissions", actorId: "teacher", revision: 2, scope: "students", microphoneAllowed: false, publisher: "teacher:tab" };
  globalThis.fixtureRtm.listener({ message: JSON.stringify(patch), publisher: "student:tab" });
  assert.equal(received[0].publisher, "student:tab");
  globalThis.fixtureRtm.listener({ message: JSON.stringify(patch) });
  assert.equal(received[1].publisher, undefined);
  globalThis.fixtureRtm.listener({ message: "invalid JSON", publisher: "teacher:tab" });
  assert.equal(received.length, 2);
  await provider.disconnect();
});
