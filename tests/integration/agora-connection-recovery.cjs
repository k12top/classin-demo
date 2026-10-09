/* eslint-disable @typescript-eslint/no-require-imports -- Isolated SDK harness runs the real provider as CommonJS. */
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

function fixture() {
  const clients = [], tracks = [], subscriptions = [];
  function makeTrack(deviceId) {
    const track = new EventEmitter();
    track.mediaTrack = { enabled: true, readyState: "live", getSettings: () => ({ deviceId: track.deviceId }) };
    track.deviceId = deviceId;
    track.getMediaStreamTrack = () => track.mediaTrack;
    track.close = () => { track.closed = true; track.mediaTrack.readyState = "ended"; };
    track.setDevice = async (id) => { track.deviceId = id; };
    track.setEncoderConfiguration = async (config) => { track.encoder = config; };
    track.setMuted = async (muted) => { track.mediaTrack.enabled = !muted; };
    tracks.push(track);
    return track;
  }
  const sdk = {
    registerExtensions: () => undefined, checkSystemRequirements: () => true,
    createCameraVideoTrack: async (config) => makeTrack(config.cameraId || "main"),
    createMicrophoneAudioTrack: async () => makeTrack("microphone"),
    createScreenVideoTrack: async () => makeTrack("screen"),
    createClient: () => {
      const client = new EventEmitter();
      Object.assign(client, { connectionState: "CONNECTED", remoteUsers: [],
        join: async (...args) => { client.joined = args; client.connectionState = "CONNECTED"; },
        publish: async (track) => { client.published = track; },
        unpublish: async (track) => { client.unpublished = track; },
        leave: async () => { client.left = true; },
        renewToken: async (token) => { client.token = token; },
        subscribe: async (user, kind) => subscriptions.push([user.uid, kind]),
        setRemoteVideoStreamType: async () => undefined,
        setClientRole: async (role) => { client.role = role; },
        setLowStreamParameter: () => undefined, enableDualStream: async () => undefined,
      });
      clients.push(client); return client;
    },
  };
  const filename = path.resolve(__dirname, "../../src/lib/classroom/providers/agora/client.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  const recovery = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../../src/lib/classroom/agora-credential-recovery.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: recovery, DOMException });
  const profile = { width: 1280, height: 720, frameRate: 30, bitrateKbps: 1200 };
  vm.runInNewContext(source, { exports, console, DOMException, window: { matchMedia: () => ({ matches: false }) },
    require(name) {
      if (name === "agora-rtc-sdk-ng") return sdk;
      if (name === "agora-extension-virtual-background") return class {};
      if (name.endsWith("/config")) return { classroomMediaProfile: { screen: profile, camera: { low: profile } }, classroomVideoPresets: { hd: { camera: { high: profile } }, fullHd: { camera: { high: { ...profile, width: 1920 } } } } };
      if (name.endsWith("/screen-share")) return { isScreenShareUserId: () => false };
      if (name.endsWith("/rtc-uid")) return { isClassroomScreenRtcUid: (id) => Number(id) > 1e9 && Number(id) <= 2e9 };
      if (name.endsWith("/stt-caption")) return { decodeClassroomSttCaption: () => null };
      if (name.endsWith("/agora-credential-recovery")) return recovery;
      if (name.endsWith("/types")) return { credentialCanPublish: (credential) => credential.role !== "student" || credential.publishAllowed === true };
      throw new Error("Unexpected import: " + name);
    },
  }, { filename });
  return { provider: new exports.AgoraRtcMediaProvider(), clients, tracks, sdk, makeTrack, subscriptions };
}
const credential = { appId: "test", channelName: "lesson", rtcUid: 1, userId: "teacher", role: "teacher", scenario: "communication", token: "main",
 screenShare: { rtcUid: 1_000_000_001, token: "screen", userId: "teacher::screen" } };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const permissions = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../../src/lib/classroom/media-permissions.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: permissions });

test("moderation stops native audio immediately and restores it without leaving the channel", async () => {
  const { provider, clients, tracks } = fixture();
  await provider.connect(credential, "教师"); await provider.toggleMicrophone();
  const microphone = tracks[0], mutedCalls = [];
  let finish;
  microphone.setMuted = muted => { mutedCalls.push(muted); return new Promise(resolve => { finish = resolve; }); };
  const muting = permissions.applyMicrophonePermission(provider, false);
  assert.equal(microphone.mediaTrack.enabled, false, "capture must stop before the SDK responds");
  await tick();
  assert.equal(provider.getSnapshot().local.microphoneOn, false);
  const restoring = permissions.applyMicrophonePermission(provider, true);
  finish(); await tick();
  assert.deepEqual(mutedCalls, [true, false]);
  finish(); await Promise.all([muting, restoring]);
  assert.equal(provider.getSnapshot().local.microphoneOn, true);
  assert.equal(microphone.mediaTrack.enabled, true);
  assert.equal(clients[0].left, undefined);
  assert.equal(tracks.length, 1, "restore reuses the same captured microphone");
  await provider.disconnect();
});

test("rapid local toggles serialize SDK changes and preserve the latest intended state", async () => {
  const { provider, tracks } = fixture();
  await provider.connect(credential, "教师"); await provider.toggleMicrophone();
  const microphone = tracks[0], calls = [], gates = [];
  microphone.setMuted = muted => { calls.push(muted); return new Promise(resolve => { gates.push(() => { microphone.mediaTrack.enabled = !muted; resolve(); }); }); };
  const first = provider.toggleMicrophone(); await tick();
  const second = provider.toggleMicrophone(); const third = provider.toggleMicrophone();
  assert.deepEqual(calls, [true]);
  gates.shift()(); await tick(); assert.deepEqual(calls, [true, false]);
  assert.equal(microphone.mediaTrack.enabled, false, "the earlier completion cannot override the latest mute");
  gates.shift()(); await tick(); assert.deepEqual(calls, [true, false, true]);
  assert.equal(microphone.mediaTrack.enabled, false);
  gates.shift()(); await Promise.all([first, second, third]);
  assert.equal(provider.getSnapshot().local.microphoneOn, false);
  await provider.disconnect();
});

test("a delayed capture cannot publish after the teacher disables the microphone", async () => {
  const { provider, sdk, makeTrack, clients } = fixture();
  await provider.connect(credential, "教师");
  let finish;
  sdk.createMicrophoneAudioTrack = () => new Promise(resolve => { finish = resolve; });
  const capturing = provider.toggleMicrophone();
  await permissions.applyMicrophonePermission(provider, false);
  const late = makeTrack("late-microphone"); finish(late);
  await assert.rejects(capturing, { name: "AbortError" });
  assert.equal(late.closed, true); assert.equal(clients[0].published, undefined);
  await assert.rejects(provider.toggleMicrophone(), /尚未允许|暂未允许/);
  await permissions.applyMicrophonePermission(provider, true);
  assert.equal(provider.getSnapshot().local.microphoneOn, false, "an interrupted capture does not count as a previously speaking mic");
  await provider.disconnect();
});

test("an SDK mute failure never re-enables microphone capture against teacher permission", async () => {
  const { provider, tracks } = fixture();
  await provider.connect(credential, "教师"); await provider.toggleMicrophone();
  tracks[0].setMuted = async () => { throw new Error("SDK unavailable"); };
  await assert.rejects(permissions.applyMicrophonePermission(provider, false), /SDK unavailable/);
  assert.equal(tracks[0].mediaTrack.enabled, false);
  assert.equal(provider.getSnapshot().local.microphoneOn, false);
  tracks[0].setMuted = async muted => { tracks[0].mediaTrack.enabled = !muted; };
  await permissions.applyMicrophonePermission(provider, true);
  assert.equal(provider.getSnapshot().local.microphoneOn, true);
  await provider.disconnect();
});

test("lesson-start recovery restores missing audio subscriptions without changing local media", async () => {
  const { provider, clients, subscriptions } = fixture();
  await provider.connect(credential, "教师");
  await provider.toggleMicrophone();
  let plays = 0;
  const remote = { uid: 123, hasAudio: true, hasVideo: false };
  clients[0].remoteUsers.push(remote);
  clients[0].subscribe = async (user, kind) => {
    subscriptions.push([user.uid, kind]);
    user.audioTrack = { play: () => { plays++; }, stop: () => undefined };
  };
  await provider.recoverMedia();
  assert.equal(subscriptions.length, 1);
  assert.equal(plays, 1);
  assert.equal(provider.getSnapshot().local.microphoneOn, true);
  assert.equal(clients[0].left, undefined);
  await provider.recoverMedia();
  assert.equal(subscriptions.length, 1, "an existing subscription should only replay");
  assert.equal(plays, 2);
  clients[0].emit("connection-state-change", "CONNECTED", "RECONNECTING");
  await tick();
  assert.equal(plays, 3, "SDK reconnect replays audio automatically");
  await provider.disconnect();
});

test("foreground recovery waits for token renewal and uses the fresh credential", async () => {
  const { provider, clients } = fixture();
  await provider.connect(credential, "教师");
  let finish;
  clients[0].renewToken = () => new Promise(resolve => { finish = resolve; });
  const renewing = provider.renewCredential({ ...credential, token: "fresh-main" });
  await tick(); clients[0].connectionState = "DISCONNECTED";
  const recovering = provider.recoverMedia();
  await tick(); assert.equal(clients[0].joined[2], "main", "recovery must not join with the previous token");
  finish(); await renewing; await recovering;
  assert.equal(clients[0].joined[2], "fresh-main");
  await provider.disconnect();
});

test("leaving while the primary rejoin is pending cannot restore the connection", async () => {
  const { provider, clients } = fixture();
  await provider.connect(credential, "教师"); await provider.toggleCamera();
  clients[0].connectionState = "DISCONNECTED";
  let finish;
  clients[0].join = () => new Promise(resolve => { finish = resolve; });
  const renewing = provider.renewCredential({ ...credential, token: "fresh-main" });
  const rejected = assert.rejects(renewing, { name: "AbortError" });
  await tick(); await provider.disconnect(); finish(); await rejected;
  assert.equal(clients[0].left, true); assert.equal(provider.getSnapshot().connectionState, "disconnected");
  assert.equal(provider.getSnapshot().participants.length, 0);
});

test("connection snapshots preserve the SDK disconnection reason", async () => {
  const { provider, clients } = fixture();
  await provider.connect(credential, "教师");
  clients[0].emit("connection-state-change", "DISCONNECTED", "CONNECTED", "TOKEN_EXPIRE");
  const event = provider.getSnapshot().connectionEvent;
  assert.equal(event.state, "disconnected"); assert.equal(event.previousState, "connected"); assert.equal(event.reason, "TOKEN_EXPIRE");
  assert.ok(event.sequence > 0); assert.ok(Number.isFinite(Date.parse(event.occurredAt)));
  await provider.disconnect();
});

test("tokens that will expire renew without leaving an active classroom", async () => {
  const { provider, clients } = fixture();
  await provider.connect(credential, "教师"); clients[0].emit("token-privilege-will-expire");
  await provider.renewCredential({ ...credential, token: "fresh-main" });
  assert.equal(clients[0].token, "fresh-main"); assert.equal(clients[0].left, undefined); assert.equal(clients[0].joined[2], "main");
  await provider.disconnect();
});

test("renewal cannot restore student media after publishing permission is revoked", async () => {
  const { provider, clients, tracks } = fixture();
  const student = { ...credential, role: "student", publishAllowed: true };
  await provider.connect(student, "学生"); await provider.toggleCamera(); await provider.startScreenShare();
  clients[0].connectionState = "DISCONNECTED";
  let publications = 0; clients[0].publish = async () => { publications++; };
  await provider.renewCredential({ ...student, token: "fresh-audience", publishAllowed: false, screenShare: undefined });
  assert.equal(publications, 0); assert.equal(tracks[0].closed, true); assert.equal(tracks[1].closed, true);
  assert.equal(provider.getSnapshot().local.cameraOn, false); assert.equal(provider.getSnapshot().local.screenSharing, false);
  assert.equal(clients[0].joined[2], "fresh-audience"); await provider.disconnect();
});

for (const kind of ["camera", "microphone"]) test(`leaving during ${kind} recapture releases the late track`, async () => {
  const { provider, clients, tracks, sdk, makeTrack } = fixture();
  await provider.connect(credential, "教师");
  await provider[kind === "camera" ? "toggleCamera" : "toggleMicrophone"]();
  tracks[0].mediaTrack.readyState = "ended"; clients[0].connectionState = "DISCONNECTED";
  let publications = 0;
  clients[0].publish = async () => { publications++; };
  await provider.renewCredential({ ...credential, token: "fresh-main" });
  assert.equal(publications, 0, "ended tracks cannot block token recovery");
  let finish;
  sdk[kind === "camera" ? "createCameraVideoTrack" : "createMicrophoneAudioTrack"] = () => new Promise(resolve => { finish = resolve; });
  const recovering = provider.recoverMedia(); const rejected = assert.rejects(recovering, { name: "AbortError" });
  await tick(); await provider.disconnect(); const late = makeTrack(kind); finish(late); await rejected;
  assert.equal(late.closed, true); assert.equal(publications, 0); assert.equal(provider.getSnapshot().participants.length, 0);
});

test("fully expired primary and screen publishers rejoin with their independent fresh tokens", async () => {
  const { provider, clients, tracks } = fixture();
  await provider.connect(credential, "教师"); await provider.toggleCamera(); await provider.startScreenShare();
  for (const client of clients) client.emit("token-privilege-did-expire");
  await provider.renewCredential({ ...credential, token: "fresh-main", screenShare: { ...credential.screenShare, token: "fresh-screen" } });
  assert.equal(clients[0].joined[2], "fresh-main"); assert.equal(clients[1].joined[2], "fresh-screen");
  assert.equal(clients[0].published[0], tracks[0]); assert.equal(clients[1].published[0], tracks[1]);
  assert.ok(clients.every(client => client.left === true)); await provider.disconnect();
});

test("screen selection cancellation never claims or replaces another presenter", async () => {
  const { provider, clients, sdk } = fixture();
  await provider.connect(credential, "教师");
  let claims = 0;
  sdk.createScreenVideoTrack = async () => { throw new DOMException("Canceled", "NotAllowedError"); };
  await assert.rejects(provider.startScreenShare(async () => { claims++; }), /Canceled/);
  assert.equal(claims, 0);
  assert.equal(clients.length, 1);
  assert.equal(provider.getSnapshot().local.screenSharing, false);
  await provider.disconnect();
});

test("server denial closes capture without publishing or disturbing microphone audio", async () => {
  const { provider, clients, tracks } = fixture();
  await provider.connect(credential, "教师");
  await provider.toggleMicrophone();
  await assert.rejects(provider.startScreenShare(async () => { throw new Error("Not authorized"); }), /Not authorized/);
  assert.equal(tracks.find(track => track.deviceId === "screen").closed, true);
  assert.equal(clients[1].joined, undefined);
  assert.equal(clients[1].published, undefined);
  assert.equal(provider.getSnapshot().local.microphoneOn, true);
  assert.equal(clients[0].left, undefined);
  await provider.disconnect();
});

test("authorization happens after capture and before RTC publication; stopping cancels a pending start", async () => {
  const { provider, clients, tracks } = fixture();
  await provider.connect(credential, "教师");
  let authorize;
  const starting = provider.startScreenShare(() => {
    assert.equal(tracks.find(track => track.deviceId === "screen").closed, undefined);
    assert.equal(clients[1].joined, undefined);
    return new Promise(resolve => { authorize = resolve; });
  });
  await tick();
  await provider.stopScreenShare();
  authorize();
  await assert.rejects(starting, error => error.name === "AbortError");
  assert.equal(clients[1].published, undefined);
  assert.equal(provider.getSnapshot().local.screenSharing, false);
  assert.equal(clients[0].left, undefined);
  await provider.disconnect();
});

test("leaving while the browser picker is open closes the eventual track", async () => {
  const { provider, sdk, makeTrack } = fixture();
  await provider.connect(credential, "教师");
  let select;
  sdk.createScreenVideoTrack = () => new Promise(resolve => { select = resolve; });
  let claims = 0;
  const starting = provider.startScreenShare(async () => { claims++; });
  await provider.disconnect();
  const track = makeTrack("pending-screen"); select(track);
  await assert.rejects(starting, error => error.name === "AbortError");
  assert.equal(track.closed, true);
  assert.equal(claims, 0);
});

test("a delayed end event from the old screen cannot stop its replacement", async () => {
  const { provider, tracks } = fixture();
  await provider.connect(credential, "教师");
  await provider.startScreenShare(async () => undefined);
  const old = tracks.find(track => track.deviceId === "screen");
  await provider.stopScreenShare();
  await provider.startScreenShare(async () => undefined);
  old.emit("track-ended");
  await tick();
  assert.equal(provider.getSnapshot().local.screenSharing, true);
  assert.equal(tracks.at(-1).closed, undefined);
  await provider.disconnect();
});
