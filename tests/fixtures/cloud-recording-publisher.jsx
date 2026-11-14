// Real Agora publication and STT reception; only camera/microphone capture is synthetic.
import AgoraRTC from "agora-rtc-sdk-ng";
import { AgoraRtcMediaProvider } from "@/lib/classroom/providers/agora/client";
import { installAgoraSdpCompatibility } from "@/lib/classroom/rtc-sdp-compat";
import { createFastboard, mount } from "@netless/fastboard";

AgoraRTC.setLogLevel(4);
installAgoraSdpCompatibility();
const provider = new AgoraRtcMediaProvider();
const captions = [];
const canvas = document.createElement("canvas");
canvas.width = 1280; canvas.height = 720;
const context = canvas.getContext("2d");
const timer = setInterval(() => {
  context.fillStyle = "#193a45"; context.fillRect(0, 0, 1280, 720);
  context.fillStyle = "#a9e2ce"; context.font = "48px sans-serif";
  context.fillText("Classroom recording verification", 70, 150);
  context.fillStyle = "white"; context.font = "36px sans-serif";
  context.fillText("One half + one half = one whole", 70, 270);
  context.fillText(new Date().toISOString(), 70, 360);
  context.fillRect((performance.now() / 5) % 1100, 520, 100, 30);
}, 66);
const video = canvas.captureStream(15).getVideoTracks()[0];
let audioContext;
let board;
AgoraRTC.createCameraVideoTrack = async options => {
  const track = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: video });
  await track.setEncoderConfiguration(options.encoderConfig);
  return track;
};
AgoraRTC.createMicrophoneAudioTrack = async () => {
  audioContext = new AudioContext();
  const source = audioContext.createBufferSource();
  source.buffer = await audioContext.decodeAudioData(await (await fetch("/speech.wav")).arrayBuffer());
  source.loop = true;
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination); await audioContext.resume(); source.start();
  return AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: destination.stream.getAudioTracks()[0], encoderConfig: "speech_standard" });
};
provider.subscribeCaptions(caption => { captions.push(caption); });
async function save() {
  const snapshot = provider.getSnapshot();
  await fetch("/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    at: new Date().toISOString(), connection: snapshot.connectionState,
    local: { cameraOn: snapshot.local.cameraOn, microphoneOn: snapshot.local.microphoneOn }, whiteboardReady: Boolean(board?.canOperate),
    participants: snapshot.participants.map(p => ({ id: p.id, hasVideo: p.hasVideo, hasAudio: p.hasAudio })), captions,
  }) });
}
window.cloudPublisher = {
  async stop() { await save(); clearInterval(timer); await provider.disconnect(); await board?.destroy(); video.stop(); await audioContext?.close(); },
};
try {
  const credential = await (await fetch("/credential")).json();
  await provider.connect(credential, "Synthetic teacher");
  await provider.toggleMicrophone(); await provider.toggleCamera();
  document.body.append(canvas);
  const { whiteboard: credentialBoard } = await (await fetch("/whiteboard")).json();
  board = await createFastboard({
    sdkConfig: { appIdentifier: credentialBoard.appIdentifier, region: credentialBoard.region, loggerOptions: { localLog: { enabled: false } } },
    joinRoom: { uid: "synthetic-whiteboard-teacher", uuid: credentialBoard.roomUuid, roomToken: credentialBoard.roomToken, isWritable: true },
  });
  const surface = document.createElement("div"); surface.style.cssText = "width:1280px;height:720px"; document.body.append(surface); mount(board, surface);
  board.room.setMemberState({ textSize: 36, strokeColor: [25, 58, 69] });
  board.room.insertText(-320, -60, "Real shared whiteboard\nOne half + one half = one whole");
  document.title = "Real cloud recording · synthetic publisher";
  await save(); setInterval(() => void save(), 2000);
} catch (error) {
  await fetch("/evidence", { method: "POST", body: JSON.stringify({ error: error.code || error.message }) });
}
