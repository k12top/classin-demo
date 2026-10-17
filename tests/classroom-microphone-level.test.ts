import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

test("Agora microphone meters use the matching live track and silence muted or non-camera streams", async () => {
  const bundle = await build({
    entryPoints: ["src/lib/classroom/providers/agora/client.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "sdk-boundary", setup(builder) {
      builder.onResolve({ filter: /^(agora-rtc-sdk-ng|agora-extension-virtual-background)$/ }, args => ({ path: args.path, namespace: "sdk" }));
      builder.onLoad({ filter: /.*/, namespace: "sdk" }, args => ({ contents: args.path === "agora-rtc-sdk-ng"
        ? "export default {registerExtensions(){}};"
        : "export default class VirtualBackgroundExtension {}", loader: "js" }));
    } }],
  });
  type Fixture = {
    credential: { rtcUid: number };
    microphoneTrack: { getVolumeLevel: () => number };
    snapshot: { local: { microphoneOn: boolean } };
    participants: Map<string, { kind: string; hasAudio: boolean }>;
    remoteUsers: Map<string, { audioTrack?: { getVolumeLevel: () => number } }>;
    getMicrophoneLevel: (id: string) => number;
  };
  const loadedModule = { exports: {} as { AgoraRtcMediaProvider: new () => Fixture } };
  runInNewContext(bundle.outputFiles[0].text, { module: loadedModule, exports: loadedModule.exports, require: createRequire(import.meta.url), console, process: { env: {} } });
  const provider = new loadedModule.exports.AgoraRtcMediaProvider();
  provider.credential = { rtcUid: 123 };
  provider.snapshot.local.microphoneOn = true;
  provider.microphoneTrack = { getVolumeLevel: () => .75 };
  provider.participants.set("123", { kind: "camera", hasAudio: true });
  provider.participants.set("456", { kind: "camera", hasAudio: true });
  provider.remoteUsers.set("456", { audioTrack: { getVolumeLevel: () => .4 } });
  assert.equal(provider.getMicrophoneLevel("123"), .75);
  assert.equal(provider.getMicrophoneLevel("456"), .4);
  assert.equal(provider.getMicrophoneLevel("unknown"), 0);
  provider.snapshot.local.microphoneOn = false;
  assert.equal(provider.getMicrophoneLevel("123"), 0);
  provider.participants.set("456", { kind: "camera", hasAudio: false });
  assert.equal(provider.getMicrophoneLevel("456"), 0);
  provider.participants.set("456", { kind: "screen", hasAudio: true });
  assert.equal(provider.getMicrophoneLevel("456"), 0);
  provider.participants.set("456", { kind: "camera", hasAudio: true });
  for (const [value, expected] of [[NaN, 0], [-1, 0], [1.5, 1]]) {
    provider.remoteUsers.set("456", { audioTrack: { getVolumeLevel: () => value } });
    assert.equal(provider.getMicrophoneLevel("456"), expected);
  }
  provider.remoteUsers.clear();
  assert.equal(provider.getMicrophoneLevel("456"), 0);
});
