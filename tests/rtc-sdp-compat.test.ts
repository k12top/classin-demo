import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAgoraIceOptions } from "../src/lib/classroom/rtc-sdp-compat";

test("removes only the ICE option that Agora cannot parse", () => {
  const input = [
    "v=0",
    "a=ice-options:trickle goog-sped-v1",
    "a=mid:0",
  ].join("\r\n");

  assert.equal(
    sanitizeAgoraIceOptions(input),
    ["v=0", "a=ice-options:trickle", "a=mid:0"].join("\r\n"),
  );
});

test("preserves standard and unknown ICE options and unrelated SDP", () => {
  const input = [
    "v=0",
    "a=ice-options:trickle renomination",
    "a=fmtp:96 goog-sped-v1=1",
  ].join("\n");

  assert.equal(sanitizeAgoraIceOptions(input), input);
});
