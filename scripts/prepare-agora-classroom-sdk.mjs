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
  "249f6308bc6b72ec29ed780f3fd24743cef833f3d2c4b280dcdf12fe2d339346";
const defaultDurationCode = "get waveArmDurationTime(){return 3}";
const extendedDurationCode = `get waveArmDurationTime(){return ${handUpDurationSeconds}}`;

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

const matches = source.split(defaultDurationCode).length - 1;
if (matches !== 1) {
  throw new Error(
    `Expected one hand-up duration default in the Agora SDK, found ${matches}.`
  );
}

const output = source.replace(defaultDurationCode, extendedDurationCode);
const outputSha256 = sha256(output);
if (outputSha256 !== expectedOutputSha256) {
  throw new Error(`Unexpected patched Agora SDK bundle (${outputSha256}).`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(
  `Prepared Agora Classroom SDK ${sdkVersion} with a ${handUpDurationSeconds}s hand-up duration.`
);
