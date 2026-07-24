import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sdkVersion = "2.9.40";
const handUpDurationSeconds = 10;
const sourcePath = path.join(
  projectRoot,
  "node_modules/agora-classroom-sdk/lib/edu_sdk.bundle.js"
);
const outputPath = path.join(
  projectRoot,
  `public/vendor/edu_sdk-${sdkVersion}-hand-up-${handUpDurationSeconds}s.bundle.js`
);

// Guard the precise official SDK build before altering its default UI behavior.
const expectedSourceSha256 =
  "f74dd0b223862a56b91bcbf124c14dd25e7dfaef021b1f68d8f0ef4ab205b5e9";
const expectedOutputSha256 =
  "c82a6727ded743b6a948940102e2f74641294d2e582b4cb116cc9d1cd0efc7ca";
const defaultDurationCode = "get waveArmDurationTime(){return 3}";
const extendedDurationCode = `get waveArmDurationTime(){return ${handUpDurationSeconds}}`;
const staleScreenShareCode =
  "case Hd.ScreenShare:if(this.isScreenSharing)return void this.classroomStore.mediaStore.stopScreenShareCapture();this.startLocalScreenShare();break;";
const recoveredScreenShareCode =
  "case Hd.ScreenShare:if(this.isScreenSharing){if(this.classroomStore.roomStore.screenShareUserUuid===r.EduClassroomConfig.shared.sessionInfo.userUuid&&0===this.classroomStore.mediaStore.localScreenShareTrackState)return this._activeCabinetItems.delete(Hd.ScreenShare),this.classroomStore.streamStore.unpublishScreenShare(),void this.startLocalScreenShare();return void this.classroomStore.mediaStore.stopScreenShareCapture()}this.startLocalScreenShare();break;";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const source = await readFile(sourcePath, "utf8");
const sourceSha256 = sha256(source);
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error(
    `Unexpected agora-classroom-sdk ${sdkVersion} bundle (${sourceSha256}). ` +
      "Review the SDK before updating the hand-up duration patch."
  );
}

const durationMatches = source.split(defaultDurationCode).length - 1;
if (durationMatches !== 1) {
  throw new Error(
    `Expected one hand-up duration default in the Agora SDK, found ${durationMatches}.`
  );
}

const screenShareMatches = source.split(staleScreenShareCode).length - 1;
if (screenShareMatches !== 1) {
  throw new Error(
    `Expected one screen-share toolbar handler in the Agora SDK, found ${screenShareMatches}.`
  );
}

const output = source
  .replace(defaultDurationCode, extendedDurationCode)
  .replace(staleScreenShareCode, recoveredScreenShareCode);
const outputSha256 = sha256(output);
if (outputSha256 !== expectedOutputSha256) {
  throw new Error(`Unexpected patched Agora SDK bundle (${outputSha256}).`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(
  `Prepared Agora Classroom SDK ${sdkVersion} with a ${handUpDurationSeconds}s hand-up duration and stale screen-share recovery.`
);
