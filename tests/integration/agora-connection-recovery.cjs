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
